<template>
  <div class="moonpay-history">
    <moonpay-logo :theme="libraryTheme" />
    <template v-if="isHistoryView">
      <div class="moonpay-history-title">{{ t('moonpay.history.title') }}</div>
      <div :class="['moonpay-history-list', { empty: emptyHistory }]" v-loading="loading">
        <div
          v-button
          v-for="item in formattedItems"
          :key="item.id"
          class="moonpay-history-item"
          tabindex="0"
          @click="navigateToDetails(item)"
        >
          <div class="moonpay-history-item-data">
            <div class="moonpay-history-item__date">{{ item.formatted.date }}</div>
            <div class="moonpay-history-item__amount">
              <template v-if="item.formatted.cryptoAmount">
                <formatted-amount
                  class="moonpay-history-item-amount"
                  value-can-be-hidden
                  :value="item.formatted.cryptoAmount"
                  :font-size-rate="FontSizeRate.MEDIUM"
                  :asset-symbol="item.formatted.crypto"
                />
                <i class="network-icon network-icon--ethereum" />&nbsp; <span>{{ t('forText') }}</span>
                &nbsp;
              </template>
              <formatted-amount
                class="moonpay-history-item-amount"
                value-can-be-hidden
                :value="item.formatted.fiatAmount"
                :font-size-rate="FontSizeRate.MEDIUM"
                :asset-symbol="item.formatted.fiat"
              />
            </div>
            <div class="moonpay-history-item__wallet-address">
              {{ item.walletAddress }}
            </div>
          </div>
          <s-icon :class="['moonpay-history-item-icon', item.status]" :name="item.formatted.icon" size="14" />
        </div>
        <span v-if="emptyHistory">{{ t('moonpay.history.empty') }}</span>
      </div>
      <history-pagination
        v-if="!emptyHistory"
        class="moonpay-history-pagination"
        :current-page="currentPage"
        :page-amount="pageAmount"
        :total="total"
        :loading="loading"
        :last-page="lastPage"
        @pagination-click="handlePaginationClick"
      />
    </template>
    <template v-else>
      <widget :src="detailsWidgetUrl" />
      <s-button
        v-if="isCompletedTransaction"
        :type="actionButtonType"
        :disabled="actionButtonDisabled"
        :loading="loading"
        class="moonpay-details-button s-typography-button--big"
        @click="handleTransaction"
      >
        {{ actionButtonText }}
      </s-button>
    </template>
  </div>
</template>

<script lang="ts">
import { WALLET_CONSTS, components, mixins } from '@soramitsu/soraneo-wallet-web';
import { Component, Mixins } from 'vue-property-decorator';

import MoonpayBridgeInitMixin from '../../../components/pages/Moonpay/BridgeInitMixin';
import MoonpayLogo from '../../../components/shared/Logo/Moonpay.vue';
import X1exLogo from '../../../components/shared/Logo/X1ex.vue';
import { Components } from '../../../consts';
import { lazyComponent } from '../../../router';
import { action, getter, state } from '../../../store/decorators';
import { getCssVariableValue, toQueryString } from '../../../utils';
import ethersUtil from '../../../utils/ethers-util';
import { MoonpayTransactionStatus } from '../../../utils/moonpay';

import type { MoonpayTransaction, MoonpayCurrency, MoonpayCurrenciesById } from '../../../utils/moonpay';
import type { EthHistory } from '@sora-substrate/util/build/bridgeProxy/eth/types';
import type Theme from '@soramitsu/soramitsu-js-ui/lib/types/Theme';

const HistoryView = 'history';
const DetailsView = 'details';

@Component({
  components: {
    MoonpayLogo,
    X1exLogo,
    FormattedAmount: components.FormattedAmount,
    GenericPageHeader: lazyComponent(Components.GenericPageHeader),
    Widget: lazyComponent(Components.Widget),
    HistoryPagination: components.HistoryPagination,
  },
})
export default class MoonpayHistory extends Mixins(mixins.PaginationSearchMixin, MoonpayBridgeInitMixin) {
  readonly FontSizeRate = WALLET_CONSTS.FontSizeRate;

  @state.moonpay.transactions private transactions!: Array<MoonpayTransaction>;
  @state.moonpay.currencies private currencies!: MoonpayCurrency[];

  @getter.web3.isValidNetwork private isValidNetwork!: boolean;
  @getter.libraryTheme libraryTheme!: Theme;

  @action.moonpay.getTransactions private getTransactions!: AsyncFnWithoutArgs;
  @action.moonpay.getCurrencies private getCurrencies!: AsyncFnWithoutArgs;

  pageAmount = 5; // override PaginationSearchMixin
  currentView = HistoryView;
  selectedItem: any = {};

  created(): void {
    this.withApi(async () => {
      this.initMoonpayApi(); // MoonpayBridgeInitMixin
      await this.prepareEvmNetwork();
      await Promise.all([this.getTransactions(), this.getCurrencies()]);
    });
  }

  get currenciesById(): MoonpayCurrenciesById {
    return this.currencies.reduce(
      (result, item) => ({
        ...result,
        [item.id]: item,
      }),
      {}
    );
  }

  get emptyHistory(): boolean {
    return !this.transactions.length;
  }

  get total(): number {
    return this.transactions.length;
  }

  get historyItems(): Array<MoonpayTransaction> {
    return this.getPageItems(this.transactions);
  }

  get formattedItems(): Array<any> {
    const { currenciesById, historyItems, formatDate } = this;
    const formatCurrencyName = (id: string) => (currenciesById[id]?.code ?? '').toUpperCase();
    const formatCurrencyAmount = (amount: number) => (Number.isFinite(amount) ? String(amount) : amount);
    const iconStatus = (status) => {
      if (status === MoonpayTransactionStatus.Completed) return 'basic-check-mark-24';
      if (status === MoonpayTransactionStatus.Failed) return 'basic-clear-X-24';

      return 'basic-more-horizontal-24';
    };

    return historyItems.map((item) => {
      return {
        ...item,
        formatted: {
          fiat: formatCurrencyName(item.baseCurrencyId),
          fiatAmount: formatCurrencyAmount(item.baseCurrencyAmount),
          crypto: formatCurrencyName(item.currencyId),
          cryptoAmount: formatCurrencyAmount(item.quoteCurrencyAmount),
          date: formatDate(new Date(item.updatedAt).getTime()),
          icon: iconStatus(item.status),
        },
      };
    });
  }

  get detailsWidgetUrl(): string {
    if (!this.selectedItem.id) return '';

    const query = toQueryString({
      colorCode: getCssVariableValue('--s-color-theme-accent'),
      language: this.language,
      transactionId: this.selectedItem.id,
    });
    return `${this.selectedItem.returnUrl}?${query}`;
  }

  get bridgeTxToSora(): Nullable<EthHistory> {
    if (!this.selectedItem.id) return undefined;

    return this.getBridgeHistoryItemByMoonpayId(this.selectedItem.id);
  }

  get isCompletedTransaction(): boolean {
    return this.selectedItem?.status === MoonpayTransactionStatus.Completed;
  }

  get externalAccountIsMoonpayRecipient(): boolean {
    return this.selectedItem?.walletAddress?.toLowerCase?.() === this.evmAddress.toLowerCase();
  }

  get actionButtonType(): string {
    return this.bridgeTxToSora ? 'secondary' : 'primary';
  }

  get actionButtonDisabled(): boolean {
    return !this.externalAccountIsMoonpayRecipient;
  }

  get actionButtonText(): string {
    if (!this.evmAddress) return this.t('connectWalletText');

    if (this.bridgeTxToSora) return this.t('moonpay.buttons.view');
    if (!this.externalAccountIsMoonpayRecipient) return this.t('changeAccountText');
    if (!this.isValidNetwork) return this.t('changeNetworkText');

    return this.t('moonpay.buttons.transfer');
  }

  get isHistoryView(): boolean {
    return this.currentView === HistoryView;
  }

  private changeView(view: string): void {
    this.currentView = view;
  }

  async handlePaginationClick(button: WALLET_CONSTS.PaginationButton): Promise<void> {
    let current = 1;

    switch (button) {
      case WALLET_CONSTS.PaginationButton.Prev:
        current = this.currentPage - 1;
        break;
      case WALLET_CONSTS.PaginationButton.Next:
        current = this.currentPage + 1;
        if (current === this.lastPage) {
          this.isLtrDirection = false;
        }
        break;
      case WALLET_CONSTS.PaginationButton.First:
        this.isLtrDirection = true;
        break;
      case WALLET_CONSTS.PaginationButton.Last:
        current = this.lastPage;
        this.isLtrDirection = false;
        break;
    }

    this.currentPage = current;
  }

  handleBack(): void {
    this.loading = false;
    this.changeView(HistoryView);
  }

  async navigateToDetails(item): Promise<void> {
    try {
      this.selectedItem = item;
      this.changeView(DetailsView);
    } catch (error) {
      console.error(error);
    }
  }

  async handleTransaction(): Promise<void> {
    if (!this.selectedItem.id) return;

    if (!this.isValidNetwork) {
      this.changeEvmNetworkProvided();
    } else if (this.bridgeTxToSora?.id) {
      await this.prepareEvmNetwork(); // MoonpayBridgeInitMixin
      await this.showHistory(this.bridgeTxToSora.id); // MoonpayBridgeInitMixin
    } else {
      await this.prepareMoonpayTxForBridgeTransfer(this.selectedItem);
    }
  }
}
</script>

<style lang="scss">
.page-header-title--moonpay-history {
  .page-header-title {
    margin: auto;
  }
}
.moonpay-history-pagination {
  width: 100%;
}

.pay-option-tab {
  display: block;
}
</style>

<style lang="scss" scoped>
$list-item-min-height: 76px;
$separator-margin: calc(var(--s-basic-spacing) / 2);

.moonpay-history {
  position: relative;
  display: flex;
  flex-flow: column nowrap;
  align-items: center;

  & > *:not(:last-child) {
    margin-bottom: $inner-spacing-medium;
  }

  &-title {
    font-size: var(--s-font-size-extra-small);
    font-weight: 300;
    line-height: var(--s-line-height-base);
  }

  &-list {
    width: 100%;
    min-height: $list-item-min-height;
    &.empty {
      text-align: center;
    }
  }

  &-item {
    display: flex;
    align-items: center;
    border-radius: var(--s-border-radius-small);
    flex-flow: row nowrap;
    line-height: var(--s-line-height-medium);
    font-size: var(--s-font-size-small);
    font-weight: 300;
    padding: $inner-spacing-mini $inner-spacing-medium;
    margin: 0 -#{$inner-spacing-small};
    min-height: $list-item-min-height;

    &:hover {
      background-color: var(--s-color-base-background-hover);
      cursor: pointer;
    }

    &-data {
      flex: 1;
    }

    &__date {
      color: var(--s-color-base-content-secondary);
      font-size: var(--s-font-size-mini);
    }

    &__wallet-address {
      color: var(--s-color-base-content-secondary);
    }

    &__amount {
      display: flex;
      align-items: center;
    }

    &-amount {
      font-weight: 600;
    }

    &-icon {
      color: var(--s-color-base-content-secondary);

      &.completed {
        color: var(--s-color-status-success);
      }
      &.failed {
        color: var(--s-color-status-error);
      }
    }

    .network-icon {
      margin-left: $separator-margin;
    }
  }
}

.moonpay-details {
  &-button {
    width: 100%;
  }
}
</style>
