<template>
  <s-design-system-provider :value="libraryDesignSystem" id="app" class="app" :class="dsProviderClasses">
    <app-header :loading="loading" @toggle-menu="toggleMenu" />
    <div :class="appClasses">
      <app-menu
        :visible="menuVisibility"
        :on-select="goTo"
        :is-about-page-opened="isAboutPage"
        @open-product-dialog="openProductDialog"
        @click.native="handleAppMenuClick"
      >
        <app-logo-button slot="head" class="app-logo--menu" :theme="libraryTheme" @click="goToSwap" />
      </app-menu>
      <div class="app-body" :class="{ 'app-body__about': isAboutPage }">
        <s-scrollbar class="app-body-scrollbar" v-loading="pageLoading">
          <div class="app-content">
            <router-view :parent-loading="loading || !nodeIsConnected" />
            <app-disclaimer v-if="disclaimerVisibility" />
          </div>
        </s-scrollbar>
      </div>
    </div>
    <app-footer />
    <referrals-confirm-invite-user :visible.sync="showConfirmInviteUser" />
    <bridge-transfer-notification />
    <app-mobile-popup :visible.sync="showSoraMobilePopup" />
    <app-browser-notifs-enable-dialog :visible.sync="showBrowserNotifPopup" @set-dark-page="setDarkPage" />
    <app-browser-notifs-blocked-dialog :visible.sync="showBrowserNotifBlockedPopup" />
    <notification-enabling-page v-if="showNotifsDarkPage">
      {{ t('browserNotificationDialog.pointer') }}
    </notification-enabling-page>
    <alerts />
    <confirm-dialog />
  </s-design-system-provider>
</template>

<script lang="ts">
import {
  api,
  connection,
  components,
  mixins,
  settingsStorage,
  WALLET_CONSTS,
  WALLET_TYPES,
  AlertsApiService,
} from '@soramitsu/soraneo-wallet-web';
import debounce from 'lodash/debounce';
import { Component, Mixins, Watch } from 'vue-property-decorator';

import axiosInstance, { updateBaseUrl, getFullBaseUrl } from '@/api';
import AppFooter from '@/components/App/Footer/AppFooter.vue';
import AppHeader from '@/components/App/Header/AppHeader.vue';
import AppMenu from '@/components/App/Menu/AppMenu.vue';
import NodeErrorMixin from '@/components/mixins/NodeErrorMixin';
import SoraLogo from '@/components/shared/Logo/Sora.vue';
import { PageNames, Components, Language, BreakpointClass, Breakpoint } from '@/consts';
import { getLocale } from '@/lang';
import router, { goTo, lazyComponent } from '@/router';
import { action, getter, mutation, state } from '@/store/decorators';
import { getMobileCssClasses, preloadFontFace, updateDocumentTitle } from '@/utils';

import type { FeatureFlags } from './store/settings/types';
import type { EthBridgeSettings, SubNetworkApps } from './store/web3/types';
import type { ConnectToNodeOptions, Node } from './types/nodes';
import type { History, HistoryItem } from '@sora-substrate/util';
import type { WhitelistArrayItem } from '@sora-substrate/util/build/assets/types';
import type { EvmNetwork } from '@sora-substrate/util/build/bridgeProxy/evm/types';
import type DesignSystem from '@soramitsu/soramitsu-js-ui/lib/types/DesignSystem';
import type Theme from '@soramitsu/soramitsu-js-ui/lib/types/Theme';

@Component({
  components: {
    SoraLogo,
    AppHeader,
    AppFooter,
    AppMenu,
    Alerts: lazyComponent(Components.Alerts),
    AppMobilePopup: lazyComponent(Components.AppMobilePopup),
    AppLogoButton: lazyComponent(Components.AppLogoButton),
    AppDisclaimer: lazyComponent(Components.AppDisclaimer),
    AppBrowserNotifsEnableDialog: lazyComponent(Components.AppBrowserNotifsEnableDialog),
    AppBrowserNotifsBlockedDialog: lazyComponent(Components.AppBrowserNotifsBlockedDialog),
    ReferralsConfirmInviteUser: lazyComponent(Components.ReferralsConfirmInviteUser),
    BridgeTransferNotification: lazyComponent(Components.BridgeTransferNotification),
    NotificationEnablingPage: components.NotificationEnablingPage,
    ConfirmDialog: components.ConfirmDialog,
  },
})
export default class App extends Mixins(mixins.TransactionMixin, NodeErrorMixin) {
  /** Product-based class fields should be like show${product}Popup */
  showSoraMobilePopup = false;
  menuVisibility = false;
  showConfirmInviteUser = false;
  showNotifsDarkPage = false;
  responsiveClass = BreakpointClass.LargeDesktop;

  @state.settings.browserNotifPopupVisibility private browserNotifPopup!: boolean;
  @state.settings.browserNotifPopupBlockedVisibility private browserNotifPopupBlocked!: boolean;
  @state.wallet.account.assetsToNotifyQueue assetsToNotifyQueue!: Array<WhitelistArrayItem>;
  @state.referrals.storageReferrer storageReferrer!: string;
  @state.settings.disclaimerVisibility disclaimerVisibility!: boolean;
  @state.router.loading pageLoading!: boolean;

  @getter.settings.chartsEnabled private chartsEnabled!: boolean;
  @getter.wallet.transactions.firstReadyTx firstReadyTransaction!: Nullable<HistoryItem>;
  @getter.wallet.account.isLoggedIn isSoraAccountConnected!: boolean;
  @getter.libraryTheme libraryTheme!: Theme;
  @getter.libraryDesignSystem libraryDesignSystem!: DesignSystem;

  @mutation.wallet.settings.setSoraNetwork private setSoraNetwork!: (network: WALLET_CONSTS.SoraNetwork) => void;
  @mutation.wallet.settings.setIndexerEndpoint private setIndexerEndpoint!: (options: {
    indexer: WALLET_CONSTS.IndexerType;
    endpoint: string;
  }) => void;

  @mutation.settings.setDefaultNodes private setDefaultNodes!: (nodes: Array<Node>) => void;
  @mutation.settings.setNetworkChainGenesisHash private setNetworkChainGenesisHash!: (hash?: string) => void;
  @mutation.settings.setFaucetUrl private setFaucetUrl!: (url: string) => void;
  @mutation.settings.setFeatureFlags private setFeatureFlags!: (data: FeatureFlags) => void;
  @mutation.settings.setBrowserNotifsPopupEnabled private setBrowserNotifsPopup!: (flag: boolean) => void;
  @mutation.settings.setBrowserNotifsPopupBlocked private setBrowserNotifsPopupBlocked!: (flag: boolean) => void;
  @mutation.settings.toggleDisclaimerDialogVisibility private toggleDisclaimerDialogVisibility!: FnWithoutArgs;
  @mutation.settings.resetBlockNumberSubscription private resetBlockNumberSubscription!: FnWithoutArgs;
  @mutation.settings.setScreenBreakpointClass private setScreenBreakpointClass!: (cssClass: string) => void;
  @mutation.referrals.unsubscribeFromInvitedUsers private unsubscribeFromInvitedUsers!: FnWithoutArgs;
  @mutation.web3.setEvmNetworksApp private setEvmNetworksApp!: (data: EvmNetwork[]) => void;
  @mutation.web3.setEthBridgeSettings private setEthBridgeSettings!: (settings: EthBridgeSettings) => Promise<void>;
  @mutation.referrals.resetStorageReferrer private resetStorageReferrer!: FnWithoutArgs;

  @action.web3.setSubNetworkApps private setSubNetworkApps!: (data: SubNetworkApps) => void;
  @action.wallet.settings.setApiKeys private setApiKeys!: (apiKeys: WALLET_TYPES.ApiKeysObject) => Promise<void>;
  @action.wallet.subscriptions.resetNetworkSubscriptions private resetNetworkSubscriptions!: AsyncFnWithoutArgs;
  @action.wallet.subscriptions.resetInternalSubscriptions private resetInternalSubscriptions!: AsyncFnWithoutArgs;
  @action.wallet.subscriptions.activateNetwokSubscriptions private activateNetwokSubscriptions!: AsyncFnWithoutArgs;
  @action.settings.connectToNode private connectToNode!: (options: ConnectToNodeOptions) => Promise<void>;
  @action.settings.setLanguage private setLanguage!: (lang: Language) => Promise<void>;
  @action.settings.setBlockNumber private setBlockNumber!: AsyncFnWithoutArgs;
  @action.settings.fetchAdsArray private fetchAdsArray!: AsyncFnWithoutArgs;
  @action.referrals.getReferrer private getReferrer!: AsyncFnWithoutArgs;
  @action.wallet.account.notifyOnDeposit private notifyOnDeposit!: (info: {
    asset: WhitelistArrayItem;
    message: string;
  }) => Promise<void>;

  // [DESKTOP] To Enable Desktop
  // @mutation.wallet.account.setIsDesktop private setIsDesktop!: (v: boolean) => void;

  @Watch('assetsToNotifyQueue')
  private handleNotifyOnDeposit(whitelistAssetArray: WhitelistArrayItem[]): void {
    if (!whitelistAssetArray.length) return;
    this.notifyOnDeposit({ asset: whitelistAssetArray[0], message: this.t('assetDeposit') });
  }

  @Watch('firstReadyTransaction', { deep: true })
  private handleNotifyAboutTransaction(value: History, oldValue: History): void {
    this.handleChangeTransaction(value, oldValue);
  }

  @Watch('nodeIsConnected')
  private updateConnectionSubsriptions(nodeConnected: boolean): void {
    if (nodeConnected) {
      // after app load, the first connection to the node occurs before the wallet is loaded
      if (this.isWalletLoaded) {
        this.activateNetwokSubscriptions();
      }
      this.setBlockNumber();
    } else {
      this.resetNetworkSubscriptions();
    }
  }

  @Watch('isSoraAccountConnected')
  private async confirmInviteUserIfConnected(isSoraConnected: boolean): Promise<void> {
    if (isSoraConnected) {
      await this.confirmInvititation();
    }
  }

  @Watch('storageReferrer', { immediate: true })
  private async confirmInviteUserIfHasStorage(storageReferrerValue: string): Promise<void> {
    if (this.isSoraAccountConnected && !!storageReferrerValue) {
      await this.confirmInvititation();
    }
  }

  private async confirmInvititation(): Promise<void> {
    await this.getReferrer();
    if (this.storageReferrer) {
      if (this.storageReferrer === this.account.address) {
        this.resetStorageReferrer();
      } else {
        this.withApi(() => {
          this.showConfirmInviteUser = true;
        });
      }
    }
  }

  private setResponsiveClass(): void {
    const width = window.innerWidth;
    if (width >= Breakpoint.HugeDesktop) {
      this.responsiveClass = BreakpointClass.HugeDesktop;
    } else if (width >= Breakpoint.LargeDesktop) {
      this.responsiveClass = BreakpointClass.LargeDesktop;
    } else if (width >= Breakpoint.Desktop) {
      this.responsiveClass = BreakpointClass.Desktop;
    } else if (width >= Breakpoint.Tablet) {
      this.responsiveClass = BreakpointClass.Tablet;
    } else if (width >= Breakpoint.LargeMobile) {
      this.responsiveClass = BreakpointClass.LargeMobile;
    } else if (width < Breakpoint.LargeMobile) {
      this.responsiveClass = BreakpointClass.Mobile;
    }
    this.setScreenBreakpointClass(this.responsiveClass);
  }

  private setResponsiveClassDebounced = debounce(this.setResponsiveClass, 250);

  async created() {
    // [DESKTOP] To Enable Desktop
    // this.setIsDesktop(true);
    // element-icons is not common used, but should be visible after network connection lost
    preloadFontFace('element-icons');
    this.setResponsiveClass();
    updateBaseUrl(router);
    AlertsApiService.baseRoute = getFullBaseUrl(router);

    await this.setLanguage(getLocale() as Language);

    await this.withLoading(async () => {
      const { data } = await axiosInstance.get('/env.json');

      if (!data.NETWORK_TYPE) {
        throw new Error('NETWORK_TYPE is not set');
      }

      await this.setApiKeys(data?.API_KEYS);
      await this.setEthBridgeSettings(data.ETH_BRIDGE);
      this.setFeatureFlags(data?.FEATURE_FLAGS);
      this.setSoraNetwork(data.NETWORK_TYPE);
      this.setDefaultNodes(data?.DEFAULT_NETWORKS);
      this.setEvmNetworksApp(data.EVM_NETWORKS_IDS);
      this.setSubNetworkApps(data.SUB_NETWORKS);

      if (data.PARACHAIN_IDS) {
        api.bridgeProxy.sub.parachainIds = data.PARACHAIN_IDS;
      }

      this.setIndexerEndpoint({ indexer: WALLET_CONSTS.IndexerType.SUBQUERY, endpoint: data.SUBQUERY_ENDPOINT });
      this.setIndexerEndpoint({ indexer: WALLET_CONSTS.IndexerType.SUBSQUID, endpoint: data.SUBSQUID_ENDPOINT });

      if (data.FAUCET_URL) {
        this.setFaucetUrl(data.FAUCET_URL);
      }
      if (data.CHAIN_GENESIS_HASH) {
        this.setNetworkChainGenesisHash(data.CHAIN_GENESIS_HASH);
      }

      // connection to node
      await this.runAppConnectionToNode();
    });
    updateDocumentTitle(); // For the first load
    this.showDisclaimer();
    this.fetchAdsArray();
  }

  mounted(): void {
    window.addEventListener('resize', this.setResponsiveClassDebounced);
  }

  private get isSwapPageWithCharts(): boolean {
    return this.$route.name === PageNames.Swap && this.chartsEnabled;
  }

  private get mobileCssClasses(): string[] | undefined {
    return getMobileCssClasses();
  }

  get isAboutPage(): boolean {
    return this.$route.name === PageNames.About;
  }

  get isCurrentPageTooWide(): boolean {
    return this.isAboutPage || this.isSwapPageWithCharts || this.$route.name === PageNames.Tokens;
  }

  get dsProviderClasses(): string[] | BreakpointClass {
    return this.mobileCssClasses?.length ? [...this.mobileCssClasses, this.responsiveClass] : this.responsiveClass;
  }

  get appClasses(): Array<string> {
    const baseClass = 'app-main';
    const cssClasses: Array<string> = [baseClass];
    if (this.$route.name) {
      cssClasses.push(`${baseClass}--${this.$route.name.toLowerCase()}`);
    }
    if (this.isSwapPageWithCharts) {
      cssClasses.push(`${baseClass}--has-charts`);
    }
    return cssClasses;
  }

  get showBrowserNotifPopup(): boolean {
    return this.browserNotifPopup;
  }

  set showBrowserNotifPopup(value) {
    this.setBrowserNotifsPopup(value);
  }

  get showBrowserNotifBlockedPopup(): boolean {
    return this.browserNotifPopupBlocked;
  }

  set showBrowserNotifBlockedPopup(value) {
    this.setBrowserNotifsPopupBlocked(value);
  }

  goTo(name: PageNames): void {
    goTo(name);
    this.closeMenu();
  }

  goToSwap(): void {
    this.goTo(PageNames.Swap);
  }

  toggleMenu(): void {
    this.menuVisibility = !this.menuVisibility;
  }

  closeMenu(): void {
    this.menuVisibility = false;
  }

  setDarkPage(value: boolean) {
    this.showNotifsDarkPage = value;
  }

  showDisclaimer(): void {
    const disclaimerApprove = settingsStorage.get('disclaimerApprove');

    if (!disclaimerApprove) {
      setTimeout(() => this.toggleDisclaimerDialogVisibility(), 5_000);
    }
  }

  handleAppMenuClick(e: Event): void {
    const target = e.target as any;
    const sidebar = !!target.closest('.app-sidebar');

    if (!sidebar) {
      this.closeMenu();
    }
  }

  openProductDialog(product: string): void {
    // Product-based class fields should be like show${product}Popup (like showSoraMobilePopup)
    const fieldName = `show${product[0].toUpperCase() + product.slice(1)}Popup`;
    if (typeof this[fieldName] === 'boolean') {
      this[fieldName] = true;
    }
  }

  async beforeDestroy(): Promise<void> {
    window.removeEventListener('resize', this.setResponsiveClassDebounced);
    await this.resetInternalSubscriptions();
    await this.resetNetworkSubscriptions();
    this.resetBlockNumberSubscription();
    this.unsubscribeFromInvitedUsers();
    await connection.close();
  }

  private async runAppConnectionToNode() {
    try {
      await this.connectToNode({
        onError: (error) => this.handleNodeError(error, true), // prefer notification on connection success
        onDisconnect: this.handleNodeDisconnect,
        onReconnect: this.handleNodeReconnect,
      });
    } catch (error) {
      // we handled error using callback, do nothing
    }
  }
}
</script>

<style lang="scss">
html {
  overflow-y: hidden;
  font-size: var(--s-font-size-small);
  line-height: var(--s-line-height-base);
  letter-spacing: var(--s-letter-spacing-small);
}

ul ul {
  list-style-type: none;
}

#app {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-family: 'Sora', sans-serif;
  height: 100vh;
  color: var(--s-color-base-content-primary);
  background-color: var(--s-color-utility-body);
  transition: background-color 500ms linear;
}

.app {
  .el-loading-mask {
    background-color: var(--s-color-utility-body);
    z-index: $app-loader-layer;

    .el-loading-spinner {
      background-image: url('~@/assets/img/pswap-loader.svg');
      height: var(--s-size-medium);
      width: var(--s-size-medium);
      margin-left: calc(50% - (var(--s-size-medium) / 2));
      > svg {
        display: none;
      }
    }
  }

  &-main.app-main {
    &--rewards,
    &--referral {
      .app-content {
        width: 100%;
      }
    }
  }

  &-body-scrollbar {
    @include scrollbar;
    flex: 1;
  }
}

.mobile.ios {
  .el-scrollbar__bar,
  .asset-list .scrollbar {
    opacity: 0.01 !important; // Fix iOS double tap issues
  }
}

.el-notification.sora {
  background: var(--s-color-brand-day);
  box-shadow: var(--s-shadow-tooltip);
  border-radius: calc(var(--s-border-radius-mini) / 2);
  border: none;
  align-items: center;
  position: absolute;
  width: 405px;
  .el-notification {
    &__icon {
      position: relative;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--s-color-utility-surface);
      flex-shrink: 0;
      &:before {
        position: absolute;
        top: -2px;
        left: -2px;
      }

      &.el-icon-success {
        &,
        &:hover {
          color: var(--s-color-status-success);
        }
      }
    }
    &__content {
      margin-top: 0;
      color: var(--s-color-utility-surface);
      text-align: left;
    }
    &__closeBtn {
      top: $inner-spacing-medium;
      color: var(--s-color-utility-surface);
      &:hover {
        color: var(--s-color-utility-surface);
      }
    }
  }
  .loader {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--s-color-utility-surface);
    // If duration will be change we should create css variable for it
    animation: runloader 4.5s linear infinite;
    @keyframes runloader {
      0% {
        width: 100%;
      }
      100% {
        width: 0;
      }
    }
  }
  &:hover .loader {
    width: 0;
    animation: none;
  }
}

.el-form--actions {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.el-message-box {
  border-radius: var(--s-border-radius-small) !important;

  &__message {
    white-space: pre-line;
  }
}

.container {
  @include container-styles;
  .el-loading-mask {
    border-radius: var(--s-border-radius-medium);
  }
}

.link {
  color: var(--s-color-base-content-primary);
}

// Disabled button large typography
.s-typography-button--large.is-disabled {
  font-size: var(--s-font-size-medium) !important;
}

// Icons colors
.el-tooltip[class*=' s-icon-'],
.el-button.el-tooltip i[class*=' s-icon-'] {
  @include icon-styles(true);
}
i.icon-divider {
  @include icon-styles;
}

.app-main--orderbook {
  .app-menu {
    position: absolute;
    right: initial;
  }
  .app-content {
    display: flex;
    justify-content: center;
  }
}

@include desktop {
  .app-main {
    &.app-main--swap.app-main--has-charts {
      .app-menu {
        &:not(.collapsed) {
          position: relative;
        }

        &.collapsed {
          & + .app-body {
            margin-left: 74px;
          }
        }
      }
    }
  }
}
</style>

<style lang="scss" scoped>
.app {
  &-main {
    display: flex;
    align-items: stretch;
    height: calc(100vh - #{$header-height} - #{$footer-height});
    position: relative;
  }

  &-body {
    position: relative;
    display: flex;
    flex: 1;
    flex-flow: column nowrap;
    max-width: 100%;
    &__about {
      overflow: hidden;
    }
  }

  &-content {
    flex: 1;
    padding: $inner-spacing-medium;
  }

  &-footer {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
    padding: $basic-spacing-medium;
  }
}

.app-logo--menu {
  margin-bottom: $inner-spacing-big;

  @include large-mobile {
    display: none;
  }
}
</style>
