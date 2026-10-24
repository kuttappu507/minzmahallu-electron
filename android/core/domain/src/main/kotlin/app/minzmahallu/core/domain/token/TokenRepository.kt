package app.minzmahallu.core.domain.token

import app.minzmahallu.core.common.Codes
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.TokenEventStatus
import app.minzmahallu.core.common.TokenStatus
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.TokenDao
import app.minzmahallu.core.domain.ErrorKeys
import app.minzmahallu.core.domain.PagedList
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.domain.fail
import app.minzmahallu.core.model.TokenAssignment
import app.minzmahallu.core.model.TokenEvent
import app.minzmahallu.core.model.TokenStats
import app.minzmahallu.core.model.TokenWithFamily
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Token distribution — the household ration/iftar ticket workflow.
 *
 * Two guards from the desktop are load-bearing and are kept here:
 * * an event whose date has **not** passed can never have its date moved into
 *   the past (that would fake "the event already happened" and open an escape
 *   route around the delete rule);
 * * an event can only be **deleted after its date is over** — until then it is
 *   refused, with a compulsory reason and an audit row.
 */
@Singleton
class TokenRepository @Inject constructor(
    private val dao: TokenDao,
    private val families: FamilyDao,
    private val auth: AuthRepository,
) {

    // ------------------------------------------------------------------ events

    suspend fun events(): List<TokenEvent> = dao.events()

    suspend fun eventById(id: Long): TokenEvent = dao.eventById(id) ?: fail(ErrorKeys.NOT_FOUND)

    suspend fun createEvent(input: TokenEventInput): Long {
        val actor = auth.requireActor()
        if (input.eventName.isBlank()) fail(ErrorKeys.VALIDATION, "event name")
        if (input.eventDate.isBlank()) fail(ErrorKeys.VALIDATION, "event date")
        val id = dao.insertEvent(
            TokenEvent(
                eventName = input.eventName.trim(),
                eventType = input.eventType.ifBlank { "general" },
                eventDate = input.eventDate,
                eventTime = input.eventTime.trim(),
                venue = input.venue.trim(),
                description = input.description.trim(),
                status = TokenEventStatus.Active.wire,
            ),
        )
        auth.log(actor.id, actor.username, "CREATE", "tokens", id, "Token event '${input.eventName.trim()}' on ${input.eventDate}")
        return id
    }

    suspend fun updateEvent(id: Long, input: TokenEventInput) {
        val existing = dao.eventById(id) ?: fail(ErrorKeys.NOT_FOUND)
        val today = IstDate.today()
        val upcoming = existing.eventDate.isBlank() || existing.eventDate >= today
        if (upcoming && input.eventDate < today) fail(ErrorKeys.EVENT_NOT_OVER, "date cannot move into the past")
        dao.updateEvent(
            existing.copy(
                eventName = input.eventName.trim(),
                eventType = input.eventType.ifBlank { "general" },
                eventDate = input.eventDate,
                eventTime = input.eventTime.trim(),
                venue = input.venue.trim(),
                description = input.description.trim(),
                updatedAt = IstDate.dateTimeStr(),
            ),
        )
    }

    /** Delete an event — only once its date is over, reason compulsory. */
    suspend fun removeEvent(id: Long, reason: String): Int {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.requireActor()
        val event = dao.eventById(id) ?: fail(ErrorKeys.NOT_FOUND)
        if (event.eventDate.isBlank() || event.eventDate >= IstDate.today()) fail(ErrorKeys.EVENT_NOT_OVER)
        val count = dao.tokenCountOf(id)
        dao.deleteTokensOf(id)
        dao.deleteEvent(id)
        auth.log(
            actor.id, actor.username, "DELETE", "tokens", id,
            "Token event '${event.eventName}' deleted (with $count token(s)): ${reason.trim()}",
        )
        return count
    }

    // ------------------------------------------------------------------ tokens

    suspend fun page(
        eventId: Long?,
        status: String?,
        search: String?,
        page: Int = 1,
        pageSize: Int = 50,
    ): PagedList<TokenWithFamily> {
        val q = search?.trim()?.ifBlank { null }
        val rows = dao.page(eventId, status, q, pageSize, (page - 1) * pageSize)
        val total = dao.count(eventId, status, q)
        return PagedList(rows, total, page, pageSize)
    }

    suspend fun byId(id: Long): TokenAssignment = dao.byId(id) ?: fail(ErrorKeys.NOT_FOUND)

    /** The door lookup: read a code, see whose ticket it is. */
    suspend fun byCode(code: String): TokenWithFamily =
        dao.byCode(code.trim().uppercase()) ?: fail(ErrorKeys.TOKEN_NOT_FOUND)

    /** Which families already hold a ticket, so generation can skip them. */
    suspend fun familiesWithTokens(eventId: Long): Set<Long> = dao.familiesWithTokens(eventId).toSet()

    /** Generate tokens for the selected families, skipping those that have one. */
    suspend fun generate(eventId: Long, familyIds: List<Long>): GenerateResult {
        val actor = auth.requireActor()
        dao.eventById(eventId) ?: fail(ErrorKeys.NOT_FOUND, "event")
        val existingFamilies = dao.familiesWithTokens(eventId).toSet()
        val existingCodes = dao.codesOf(eventId).toMutableSet()
        var generated = 0
        var skipped = 0
        val issued = mutableListOf<Pair<Long, String>>()
        for (familyId in familyIds) {
            if (familyId in existingFamilies) {
                skipped++
                continue
            }
            val code = uniqueCode(existingCodes)
            existingCodes += code
            val id = dao.insert(
                TokenAssignment(
                    eventId = eventId,
                    familyId = familyId,
                    tokenCode = code,
                    status = TokenStatus.Generated.wire,
                ),
            )
            issued += id to code
            generated++
        }
        auth.log(actor.id, actor.username, "GENERATE", "tokens", eventId, "$generated token(s) generated, $skipped skipped")
        return GenerateResult(generated, skipped, familyIds.size, issued)
    }

    /** Mark a ticket collected at the door. */
    suspend fun collect(tokenId: Long): Boolean {
        val actor = auth.requireActor()
        val changed = dao.collect(tokenId, IstDate.dateTimeStr(), actor.id)
        if (changed == 0) fail(ErrorKeys.CANCELLED_TOKEN)
        return true
    }

    /** Collect by the code read/scanned at the door. */
    suspend fun collectByCode(code: String): TokenWithFamily {
        val token = byCode(code)
        if (token.token.status == TokenStatus.Cancelled.wire) fail(ErrorKeys.CANCELLED_TOKEN)
        collect(token.token.id)
        return byCode(code)
    }

    /** Cancel a ticket (lost/damaged). */
    suspend fun cancel(tokenId: Long, reason: String) {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        auth.requireActor()
        dao.cancel(tokenId, reason.trim(), IstDate.dateTimeStr())
    }

    /** Replace a lost ticket: the old one is cancelled, a fresh code is issued. */
    suspend fun replace(tokenId: Long, reason: String): Pair<Long, String> {
        if (reason.isBlank()) fail(ErrorKeys.REASON_REQUIRED)
        val actor = auth.requireActor()
        val old = dao.byId(tokenId) ?: fail(ErrorKeys.TOKEN_NOT_FOUND)
        dao.cancel(tokenId, reason.trim(), IstDate.dateTimeStr())
        val existingCodes = dao.codesOf(old.eventId).toMutableSet()
        val code = uniqueCode(existingCodes)
        val id = dao.insert(
            TokenAssignment(
                eventId = old.eventId,
                familyId = old.familyId,
                tokenCode = code,
                status = TokenStatus.Generated.wire,
                replacementFor = tokenId,
            ),
        )
        auth.log(actor.id, actor.username, "REPLACE", "tokens", id, "Token replaced ($code): ${reason.trim()}")
        return id to code
    }

    suspend fun stats(eventId: Long): TokenStats {
        val total = dao.totalFor(eventId)
        val collected = dao.collectedFor(eventId)
        val remaining = total - collected
        val rate = if (total > 0) Math.round(collected * 1000.0 / total) / 10.0 else 0.0
        return TokenStats(total, collected, remaining, rate)
    }

    /** Families with no ticket yet — what the "generate" sheet offers. */
    suspend fun familiesWithoutTokens(eventId: Long): List<app.minzmahallu.core.model.FamilyEntity> {
        val have = dao.familiesWithTokens(eventId).toSet()
        return families.all().filter { it.id !in have && it.status == "Active" }
    }

    /** 4 unguessable characters, unique within the event. */
    private fun uniqueCode(existing: Set<String>): String {
        var code = Codes.tokenCode()
        var attempts = 0
        while (code in existing && attempts < 1000) {
            code = Codes.tokenCode()
            attempts++
        }
        return code
    }
}

data class TokenEventInput(
    val eventName: String,
    val eventType: String = "general",
    val eventDate: String,
    val eventTime: String = "",
    val venue: String = "",
    val description: String = "",
)

data class GenerateResult(
    val generated: Int,
    val skipped: Int,
    val total: Int,
    val issued: List<Pair<Long, String>>,
)
