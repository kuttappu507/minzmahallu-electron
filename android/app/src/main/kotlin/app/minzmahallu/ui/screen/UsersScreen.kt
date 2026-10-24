package app.minzmahallu.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.minzmahallu.MainIntent
import app.minzmahallu.core.common.IstDate
import app.minzmahallu.core.common.PasswordPolicy
import app.minzmahallu.core.common.Role
import app.minzmahallu.core.common.RoleAccess
import app.minzmahallu.core.domain.auth.AuthRepository
import app.minzmahallu.core.model.UserEntity
import app.minzmahallu.core.ui.component.BottomSheet
import app.minzmahallu.core.ui.component.MahalluTextField
import app.minzmahallu.core.ui.component.PasswordField
import app.minzmahallu.core.ui.component.PhoneField
import app.minzmahallu.ui.common.RecordRow
import app.minzmahallu.core.ui.component.SheetFooter
import app.minzmahallu.core.ui.component.Toggle
import app.minzmahallu.session.SessionController
import app.minzmahallu.ui.common.ModuleListScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Users — `src/pages/Users.tsx`.
 *
 * Administrator only. Creating an account here sets `must_change_pwd`, so the
 * operator signs in with a handed-over password and is immediately asked for
 * their own.
 */
@Composable
fun UsersScreen(
    onOpenDrawer: () -> Unit,
    onIntent: (MainIntent) -> Unit,
    viewModel: UsersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val editor by viewModel.editor.collectAsStateWithLifecycle()

    ModuleListScreen(
        title = "Users",
        subtitle = "${state.rows.size} account(s)",
        eyebrow = "office",
        items = state.rows,
        loading = state.loading,
        search = state.search,
        onSearchChange = viewModel::onSearch,
        onOpenDrawer = onOpenDrawer,
        filters = listOf("All", "Active", "Locked", "Inactive"),
        activeFilter = state.filter,
        onFilterChange = viewModel::onFilter,
        canCreate = state.canManage,
        onCreate = viewModel::openCreate,
        createLabel = "New user",
        onRefresh = viewModel::refresh,
        emptyTitle = "No accounts",
        emptyBody = "Create an account for each operator.",
    ) { row, _ ->
        RecordRow(
            title = row.fullName,
            code = row.username,
            subtitle = listOfNotNull(
                row.role,
                row.lastLoginAt?.let { "last seen ${IstDate.fmtDateTime(it)}" },
            ).joinToString(" · ").ifBlank { null },
            status = when {
                row.isLocked == 1 -> "Locked"
                row.isActive == 0 -> "Inactive"
                else -> "Active"
            },
            dimmed = row.isActive == 0,
            onClick = { viewModel.openEdit(row) },
        )
    }

    if (editor.open) {
        val d = editor.draft
        BottomSheet(
            onDismiss = viewModel::closeEditor,
            eyebrow = if (d.id == null) "new account" else "edit account",
            title = if (d.id == null) "Add user" else d.username,
            footer = {
                SheetFooter(
                    primaryLabel = if (d.id == null) "Create" else "Save",
                    onPrimary = viewModel::save,
                    onSecondary = viewModel::closeEditor,
                    primaryEnabled = d.username.isNotBlank() && d.fullName.isNotBlank() &&
                        (d.id != null || PasswordPolicy.isValid(d.password)),
                    loading = state.busy,
                )
            },
        ) {
            MahalluTextField(
                value = d.username,
                onValueChange = { viewModel.edit { copy(username = it) } },
                label = "Username",
                enabled = d.id == null,
                error = state.error,
            )
            Spacer(Modifier.height(12.dp))
            MahalluTextField(
                value = d.fullName,
                onValueChange = { viewModel.edit { copy(fullName = it) } },
                label = "Full name",
            )
            Spacer(Modifier.height(12.dp))
            EnumField(
                label = "Role",
                value = d.role,
                options = Role.assignable.map { it.wire },
                onSelect = { viewModel.edit { copy(role = it) } },
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MahalluTextField(
                    value = d.email,
                    onValueChange = { viewModel.edit { copy(email = it) } },
                    label = "Email",
                    modifier = Modifier.weight(1f),
                )
                PhoneField(
                    value = d.phone,
                    onValueChange = { viewModel.edit { copy(phone = it) } },
                    label = "Phone",
                    modifier = Modifier.weight(1f),
                )
            }
            if (d.id == null) {
                Spacer(Modifier.height(12.dp))
                PasswordField(
                    value = d.password,
                    onValueChange = { viewModel.edit { copy(password = it) } },
                    label = "Temporary password",
                    showStrength = true,
                    supporting = "they will be asked to change it at first sign-in",
                )
            } else {
                Spacer(Modifier.height(14.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                ) {
                    androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                        app.minzmahallu.core.ui.foundation.AppText(
                            text = "Account active",
                            style = app.minzmahallu.core.ui.theme.MahalluTheme.type.bodyStrong,
                            color = app.minzmahallu.core.ui.theme.MahalluTheme.colors.textPrimary,
                        )
                    }
                    Toggle(
                        checked = d.active,
                        onCheckedChange = { viewModel.edit { copy(active = it) } },
                    )
                }
                Spacer(Modifier.height(12.dp))
                app.minzmahallu.core.ui.component.MahalluButton(
                    onClick = viewModel::resetPassword,
                    variant = app.minzmahallu.core.ui.component.ButtonVariant.Secondary,
                    text = if (d.locked) "Unlock account" else "Reset password",
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

data class UserDraft(
    val id: Long? = null,
    val username: String = "",
    val fullName: String = "",
    val role: String = Role.Member.wire,
    val email: String = "",
    val phone: String = "",
    val password: String = "",
    val active: Boolean = true,
    val locked: Boolean = false,
)

data class UsersUiState(
    val rows: List<UserEntity> = emptyList(),
    val loading: Boolean = true,
    val search: String = "",
    val filter: String = "All",
    val canManage: Boolean = false,
    val busy: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class UsersViewModel @Inject constructor(
    private val auth: AuthRepository,
    private val sessions: SessionController,
) : ViewModel() {

    data class Editor(val open: Boolean = false, val draft: UserDraft = UserDraft())

    private val _state = MutableStateFlow(UsersUiState())
    val state: StateFlow<UsersUiState> = _state.asStateFlow()

    private val _editor = MutableStateFlow(Editor())
    val editor: StateFlow<Editor> = _editor.asStateFlow()

    init {
        viewModelScope.launch {
            val role = sessions.state.first().actor?.role
            _state.update {
                it.copy(canManage = role != null && RoleAccess.canWrite(role, RoleAccess.Module.Users))
            }
        }
        refresh()
    }

    fun onSearch(value: String) {
        _state.update { it.copy(search = value) }
        refresh()
    }

    fun onFilter(value: String?) {
        _state.update { it.copy(filter = value ?: "All") }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val query = _state.value.search.trim().lowercase()
            runCatching { auth.listUsers() }
                .onSuccess { all ->
                    val filtered = all.filter { user ->
                        val matchesSearch = query.isBlank() ||
                            user.username.lowercase().contains(query) ||
                            user.fullName.lowercase().contains(query)
                        val matchesFilter = when (_state.value.filter) {
                            "Active" -> user.isActive == 1 && user.isLocked == 0
                            "Locked" -> user.isLocked == 1
                            "Inactive" -> user.isActive == 0
                            else -> true
                        }
                        matchesSearch && matchesFilter
                    }
                    _state.update { it.copy(rows = filtered, loading = false) }
                }
                .onFailure { _state.update { current -> current.copy(loading = false) } }
        }
    }

    fun openCreate() {
        _editor.value = Editor(open = true)
    }

    fun openEdit(row: UserEntity) {
        _editor.value = Editor(
            open = true,
            draft = UserDraft(
                id = row.id,
                username = row.username,
                fullName = row.fullName,
                role = row.role,
                email = row.email.orEmpty(),
                phone = row.phone.orEmpty(),
                active = row.isActive == 1,
                locked = row.isLocked == 1,
            ),
        )
    }

    fun closeEditor() {
        _editor.value = Editor()
        _state.update { it.copy(error = null) }
    }

    inline fun edit(crossinline transform: UserDraft.() -> UserDraft) {
        _editor.update { it.copy(draft = transform(it.draft)) }
    }

    fun save() {
        val d = _editor.value.draft
        if (d.username.isBlank() || d.fullName.isBlank()) return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val role = app.minzmahallu.core.common.wireTo(d.role, Role.Member)
            val result = if (d.id == null) {
                runCatching {
                    auth.createUser(
                        username = d.username.trim(),
                        fullName = d.fullName.trim(),
                        password = d.password,
                        role = role,
                        email = d.email.ifBlank { null },
                        phone = d.phone.ifBlank { null },
                    )
                }
            } else {
                runCatching {
                    auth.updateUser(
                        id = d.id,
                        fullName = d.fullName.trim(),
                        role = role,
                        email = d.email.ifBlank { null },
                        phone = d.phone.ifBlank { null },
                        active = d.active,
                    )
                }
            }
            result.onSuccess {
                _state.update { current -> current.copy(busy = false) }
                _editor.value = Editor()
                refresh()
            }.onFailure { error ->
                _state.update {
                    it.copy(busy = false, error = error.message?.takeIf(String::isNotBlank))
                }
            }
        }
    }

    /** A locked account is unlocked; an active one gets a new temporary password. */
    fun resetPassword() {
        val d = _editor.value.draft
        val id = d.id ?: return
        _state.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = if (d.locked) {
                runCatching { auth.toggleLock(id, locked = false) }
            } else {
                // A fresh temporary password, forced to be changed on next sign-in.
                val temporary = app.minzmahallu.core.common.Codes.tokenCode(10) + "aA1!"
                runCatching { auth.resetPassword(id, temporary) }
            }
            result.onSuccess {
                _state.update { current -> current.copy(busy = false) }
                _editor.value = Editor()
                refresh()
            }.onFailure { error ->
                _state.update {
                    it.copy(busy = false, error = error.message?.takeIf(String::isNotBlank))
                }
            }
        }
    }
}
