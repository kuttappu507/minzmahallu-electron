package app.minzmahallu.core.domain.certificate

import app.minzmahallu.core.common.CertificateType
import app.minzmahallu.core.common.Codes
import app.minzmahallu.core.common.DocNumber
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.QrFields
import app.minzmahallu.core.common.QrPayload
import app.minzmahallu.core.common.QrVerification
import app.minzmahallu.core.common.wireTo
import app.minzmahallu.core.database.dao.CertificateDao
import app.minzmahallu.core.database.dao.DeathDao
import app.minzmahallu.core.database.dao.DonationDao
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.MarriageDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.database.dao.SettingsDao
import app.minzmahallu.core.database.dao.SubscriptionDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.CertificateEntity
import app.minzmahallu.core.model.CertificateWithRefs
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Certificate issuing and verification.
 *
 * A certificate is an OFFICIAL document, so two rules from the desktop apply:
 * * it can only be issued against a record that is **approved** — a pending
 *   nikah or death cannot produce a certificate;
 * * every print carries an anti-forgery QR bound to the register's
 *   verification code and to this device, signed with the mahallu's key.
 */
@Singleton
class CertificateRepository @Inject constructor(
    private val dao: CertificateDao,
    private val members: MemberDao,
    private val families: FamilyDao,
    private val marriages: MarriageDao,
    private val deaths: DeathDao,
    private val donations: DonationDao,
    private val subscriptionPayments: SubscriptionDao,
    private val settings: SettingsDao,
    private val auth: AuthRepository,
) {

    suspend fun page(search: String?, type: String?, page: Int = 1, pageSize: Int = 20): PagedList<CertificateWithRefs> {
        val q = search?.trim()?.ifBlank { null }
        val rows = dao.page(q, type, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, type)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): CertificateWithRefs = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    /** Documents issued to a household, newest first — the family page's list. */
    suspend fun forFamily(familyId: Long): List<app.minzmahallu.core.model.CertificateEntity> =
        dao.byFamily(familyId)

    /** Documents issued to a person, newest first — the member page's list. */
    suspend fun forMember(memberId: Long): List<app.minzmahallu.core.model.CertificateEntity> =
        dao.byMember(memberId)

    /** Issue a membership certificate for a member. */
    suspend fun issueMembership(memberCode: String): Long {
        val member = members.searchLite(memberCode, 1).firstOrNull { it.memberCode == memberCode }
            ?: fail(ErrorKeys.NOT_FOUND, "member $memberCode")
        return issue(CertificateType.Membership, memberId = member.id, familyId = member.familyId, issuedTo = member.name)
    }

    /** Issue a residence certificate naming the head of a household. */
    suspend fun issueResidence(familyNumber: String, issuedTo: String): Long {
        val family = families.searchLite(familyNumber, 20).firstOrNull { it.familyNumber == familyNumber }
            ?: fail(ErrorKeys.NOT_FOUND, "family $familyNumber")
        val head = members.headId(family.id)?.let { members.byId(it) }
        return issue(
            CertificateType.Residence,
            familyId = family.id,
            memberId = head?.id,
            issuedTo = issuedTo.ifBlank { head?.name ?: family.houseName.orEmpty() },
        )
    }

    suspend fun issueMarriage(marriageNumber: String): Long {
        val marriage = marriages.all().firstOrNull { it.marriageNumber == marriageNumber }
            ?: fail(ErrorKeys.NOT_FOUND, "nikah $marriageNumber")
        requireApproved(marriage.approvalStatus, "nikah")
        return issue(
            CertificateType.Marriage,
            marriageId = marriage.id,
            issuedTo = "${marriage.brideName} & ${marriage.groomName}",
        )
    }

    suspend fun issueMarriageNoc(marriageNumber: String): Long {
        val marriage = marriages.all().firstOrNull { it.marriageNumber == marriageNumber }
            ?: fail(ErrorKeys.NOT_FOUND, "nikah $marriageNumber")
        requireApproved(marriage.approvalStatus, "nikah")
        return issue(
            CertificateType.MarriageNoc,
            marriageId = marriage.id,
            issuedTo = "${marriage.brideName} & ${marriage.groomName}",
        )
    }

    suspend fun issueDeath(deathNumber: String): Long {
        val all = deaths.page(deathNumber, null, null, null, 20, 0)
        val death = all.firstOrNull { it.death.deathNumber == deathNumber }
            ?: fail(ErrorKeys.NOT_FOUND, "death $deathNumber")
        requireApproved(death.death.approvalStatus, "death record")
        return issue(
            CertificateType.Death,
            deathId = death.death.id,
            familyId = death.death.familyId,
            issuedTo = death.death.deceasedName,
        )
    }

    private suspend fun issue(
        type: CertificateType,
        memberId: Long? = null,
        familyId: Long? = null,
        marriageId: Long? = null,
        deathId: Long? = null,
        issuedTo: String,
    ): Long {
        val actor = auth.requireActor()
        val config = settings.get()
        val date = IstDate.today()
        val prefix = DocNumber.mahalluPrefix(config?.receiptPrefix, config?.mahalluName)
        val number = DocNumber.nextCertificateNumber(type, date, prefix, dao.allNumbers())
        val verificationCode = Codes.verificationCode()
        val payload = QrPayload.buildCert(
            QrFields(
                number = number,
                verificationCode = verificationCode,
                fingerprint = config?.deviceFingerprint.orEmpty(),
                issuedDate = date,
            ),
            key = config?.qrSigningKey,
        )
        val id = dao.insert(
            CertificateEntity(
                certificateNumber = number,
                type = type.wire,
                memberId = memberId,
                familyId = familyId,
                marriageId = marriageId,
                deathId = deathId,
                issuedTo = issuedTo,
                issuedDate = date,
                issuedBy = actor.id,
                qrPayload = payload,
                verificationCode = verificationCode,
            ),
        )
        auth.log(actor.id, actor.username, "ISSUE", "certificates", id, "${type.wire} certificate $number issued to $issuedTo")
        return id
    }

    /** Every print after the first is watermarked as a reprint. */
    suspend fun markReprint(id: Long) {
        dao.markReprint(id)
        val actor = auth.current ?: return
        auth.log(actor.id, actor.username, "REPRINT", "certificates", id, "Certificate reprinted")
    }

    suspend fun cancel(id: Long, reason: String, adminPassword: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "CERTIFICATE_CANCEL", reason)
        dao.setStatus(id, "Cancelled")
        auth.log(actor.id, actor.username, "CANCEL", "certificates", id, "Certificate cancelled: ${reason.trim()}")
    }

    suspend fun remove(id: Long, adminPassword: String, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "CERTIFICATE_DELETE", reason)
        dao.delete(id)
        auth.log(actor.id, actor.username, "DELETE", "certificates", id, "Certificate deleted: ${reason.trim()}")
    }

    // ----------------------------------------------------------- verification

    /** Verify a certificate by its register code. */
    suspend fun verifyCode(code: String): VerifyResult {
        val clean = code.trim().uppercase()
        if (clean.isEmpty()) fail(ErrorKeys.VALIDATION, "code")
        val certificate = dao.byVerificationCode(clean) ?: dao.byNumber(clean)
            ?: return VerifyResult.NotFound
        return VerifyResult.Certificate(
            number = certificate.certificateNumber,
            type = wireTo(certificate.type, CertificateType.Membership),
            issuedTo = certificate.issuedTo.orEmpty(),
            issuedDate = certificate.issuedDate,
            status = certificate.status,
            reprints = certificate.reprintCount,
        )
    }

    /**
     * Verify a scanned QR payload: check the HMAC tag, then look the number up
     * in the register. A payload that verifies cryptographically but matches no
     * row was minted somewhere else.
     */
    suspend fun verifyQr(rawPayload: String): QrVerifyResult {
        val config = settings.get()
        val payload = QrPayload.extractScannedText(rawPayload)
        val verification = QrPayload.verify(payload, config?.qrSigningKey)
        val parsed = verification.payload ?: return QrVerifyResult(verification.signature, null)
        val matched = if (parsed.isCertificate) {
            dao.byVerificationCode(parsed.verificationCode) ?: dao.byNumber(parsed.number)
        } else {
            findReceipt(parsed.verificationCode, parsed.number)
        }
        return QrVerifyResult(verification.signature, matched)
    }

    private suspend fun findReceipt(code: String, number: String): CertificateEntity? {
        // Money receipts are verified from the money tables; the shape returned
        // is normalised to the certificate one so the UI has a single path.
        val donation = donations.page(number, null, null, null, null, 1, 0).firstOrNull()
        if (donation != null && donation.donation.verificationCode == code) {
            return CertificateEntity(
                certificateNumber = donation.donation.receiptNumber.orEmpty(),
                type = "Donation receipt",
                issuedTo = donation.donation.donorName,
                issuedDate = donation.donation.donationDate,
                status = "Posted",
                verificationCode = code,
            )
        }
        val sub = subscriptionPayments.page(number, null, null, 1, 0).firstOrNull()
        if (sub != null) {
            return CertificateEntity(
                certificateNumber = sub.subscription.receiptNumber.orEmpty(),
                type = "Subscription receipt",
                issuedTo = sub.houseName.orEmpty(),
                issuedDate = sub.subscription.paymentDate ?: sub.subscription.periodStart.orEmpty(),
                status = sub.subscription.status,
                verificationCode = code,
            )
        }
        return null
    }

    private fun requireApproved(approvalStatus: String, label: String) {
        if (approvalStatus == app.minzmahallu.core.common.ApprovalStatus.Pending.wire) {
            fail(ErrorKeys.AWAITING_APPROVAL, label)
        }
    }
}

sealed interface VerifyResult {
    data object NotFound : VerifyResult
    data class Certificate(
        val number: String,
        val type: CertificateType,
        val issuedTo: String,
        val issuedDate: String,
        val status: String,
        val reprints: Int,
    ) : VerifyResult
}

data class QrVerifyResult(
    val signature: app.minzmahallu.core.common.QrSignature,
    val record: CertificateEntity?,
) {
    val isGenuine: Boolean get() =
        record != null && signature != app.minzmahallu.core.common.QrSignature.Invalid
}

/** Re-verify the stored payload of an issued certificate. */
fun storedPayloadVerification(
    payload: String?,
    signingKey: String?,
): QrVerification = QrPayload.verify(payload, signingKey)
