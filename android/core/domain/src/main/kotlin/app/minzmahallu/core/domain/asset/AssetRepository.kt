package app.minzmahallu.core.domain.asset

import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.Money
import app.minzmahallu.core.database.dao.AssetDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.dashboard.AssetSummary
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.AssetEntity
import javax.inject.Inject
import javax.inject.Singleton

/** The asset register — buildings, lands and rentable goods. */
@Singleton
class AssetRepository @Inject constructor(
    private val dao: AssetDao,
    private val auth: AuthRepository,
) {

    suspend fun page(
        search: String?,
        category: String?,
        status: String?,
        page: Int = 1,
        pageSize: Int = 20,
    ): PagedList<AssetEntity> {
        val q = search?.trim()?.ifBlank { null }
        val rows = dao.page(q, category, status, pageSize, (page - 1) * pageSize)
        val total = dao.count(q, category, status)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): AssetEntity = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun options(): List<AssetEntity> = dao.options()

    suspend fun summary(): AssetSummary = AssetSummary(
        count = dao.count(),
        acquisitionTotal = dao.acquisitionTotal(),
        currentTotal = dao.currentTotal(),
        monthlyRent = dao.monthlyRentTotal(),
    )

    suspend fun create(input: AssetInput): Long {
        val actor = auth.requireActor()
        if (input.name.isBlank()) fail(ErrorKeys.VALIDATION, "asset name")
        Money.nonNegativeError(input.acquisitionCost.toString())?.let { fail(ErrorKeys.VALIDATION, "cost") }
        val code = input.assetCode.trim().ifBlank { "AST-${((dao.count() + 1)).toString().padStart(4, '0')}" }
        val id = dao.insert(
            AssetEntity(
                assetCode = code,
                name = input.name.trim(),
                category = input.category,
                referenceNo = input.referenceNo.trim(),
                location = input.location.trim(),
                acquisitionDate = input.acquisitionDate,
                acquisitionCost = input.acquisitionCost,
                currentValue = input.currentValue.takeIf { it > 0 } ?: input.acquisitionCost,
                status = input.status,
                conditionNote = input.condition,
                custodian = input.custodian.trim(),
                incomeGenerating = if (input.incomeGenerating) 1 else 0,
                tenantName = input.tenantName.trim(),
                monthlyRent = input.monthlyRent,
                agreementStart = input.agreementStart,
                agreementEnd = input.agreementEnd,
                notes = input.notes.trim(),
            ),
        )
        auth.log(actor.id, actor.username, "CREATE", "assets", id, "Asset $code (${input.name.trim()}) added")
        return id
    }

    suspend fun update(id: Long, input: AssetInput) {
        val before = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (input.name.isBlank()) fail(ErrorKeys.VALIDATION, "asset name")
        dao.update(
            before.copy(
                name = input.name.trim(),
                category = input.category,
                referenceNo = input.referenceNo.trim(),
                location = input.location.trim(),
                acquisitionDate = input.acquisitionDate,
                acquisitionCost = input.acquisitionCost,
                currentValue = input.currentValue,
                status = input.status,
                conditionNote = input.condition,
                custodian = input.custodian.trim(),
                incomeGenerating = if (input.incomeGenerating) 1 else 0,
                tenantName = input.tenantName.trim(),
                monthlyRent = input.monthlyRent,
                agreementStart = input.agreementStart,
                agreementEnd = input.agreementEnd,
                notes = input.notes.trim(),
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
    }

    suspend fun remove(id: Long, adminPassword: String, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.verifyAdminPassword(adminPassword, "ASSET_DELETE", reason)
        val asset = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)
        dao.delete(id)
        auth.log(actor.id, actor.username, "DELETE", "assets", id, "Asset ${asset.assetCode} removed: ${reason.trim()}")
    }
}

data class AssetInput(
    val name: String,
    val assetCode: String = "",
    val category: String = "Other",
    val referenceNo: String = "",
    val location: String = "",
    val acquisitionDate: String = "",
    val acquisitionCost: Double = 0.0,
    val currentValue: Double = 0.0,
    val status: String = "In use",
    val condition: String = "Good",
    val custodian: String = "",
    val incomeGenerating: Boolean = false,
    val tenantName: String = "",
    val monthlyRent: Double = 0.0,
    val agreementStart: String = "",
    val agreementEnd: String = "",
    val notes: String = "",
)
