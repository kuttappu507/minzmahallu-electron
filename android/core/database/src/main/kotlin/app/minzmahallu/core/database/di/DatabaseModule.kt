package app.minzmahallu.core.database.di

import android.content.Context
import app.minzmahallu.core.database.MahalluDatabase
import app.minzmahallu.core.database.dao.AssetDao
import app.minzmahallu.core.database.dao.AuditDao
import app.minzmahallu.core.database.dao.CertificateDao
import app.minzmahallu.core.database.dao.CommitteeDao
import app.minzmahallu.core.database.dao.DeathDao
import app.minzmahallu.core.database.dao.DonationDao
import app.minzmahallu.core.database.dao.FamilyDao
import app.minzmahallu.core.database.dao.HistoryDao
import app.minzmahallu.core.database.dao.LedgerDao
import app.minzmahallu.core.database.dao.MarriageDao
import app.minzmahallu.core.database.dao.MemberDao
import app.minzmahallu.core.database.dao.NotificationDao
import app.minzmahallu.core.database.dao.SettingsDao
import app.minzmahallu.core.database.dao.StaffDao
import app.minzmahallu.core.database.dao.SubscriptionDao
import app.minzmahallu.core.database.dao.TokenDao
import app.minzmahallu.core.database.dao.UserDao
import app.minzmahallu.core.database.dao.WelfareDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): MahalluDatabase =
        MahalluDatabase.build(context)

    @Provides fun provideUserDao(db: MahalluDatabase): UserDao = db.userDao()
    @Provides fun provideSettingsDao(db: MahalluDatabase): SettingsDao = db.settingsDao()
    @Provides fun provideAuditDao(db: MahalluDatabase): AuditDao = db.auditDao()
    @Provides fun provideHistoryDao(db: MahalluDatabase): HistoryDao = db.historyDao()
    @Provides fun provideFamilyDao(db: MahalluDatabase): FamilyDao = db.familyDao()
    @Provides fun provideMemberDao(db: MahalluDatabase): MemberDao = db.memberDao()
    @Provides fun provideStaffDao(db: MahalluDatabase): StaffDao = db.staffDao()
    @Provides fun provideCommitteeDao(db: MahalluDatabase): CommitteeDao = db.committeeDao()
    @Provides fun provideSubscriptionDao(db: MahalluDatabase): SubscriptionDao = db.subscriptionDao()
    @Provides fun provideDonationDao(db: MahalluDatabase): DonationDao = db.donationDao()
    @Provides fun provideLedgerDao(db: MahalluDatabase): LedgerDao = db.ledgerDao()
    @Provides fun provideAssetDao(db: MahalluDatabase): AssetDao = db.assetDao()
    @Provides fun provideMarriageDao(db: MahalluDatabase): MarriageDao = db.marriageDao()
    @Provides fun provideDeathDao(db: MahalluDatabase): DeathDao = db.deathDao()
    @Provides fun provideWelfareDao(db: MahalluDatabase): WelfareDao = db.welfareDao()
    @Provides fun provideCertificateDao(db: MahalluDatabase): CertificateDao = db.certificateDao()
    @Provides fun provideTokenDao(db: MahalluDatabase): TokenDao = db.tokenDao()
    @Provides fun provideNotificationDao(db: MahalluDatabase): NotificationDao = db.notificationDao()
}
