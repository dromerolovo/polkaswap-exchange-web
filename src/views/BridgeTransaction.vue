<template>
  <div class="container transaction-container">
    <generic-page-header has-button-back :title="t('bridgeTransaction.title')" @back="handleBack">
      <s-button
        class="el-button--history"
        type="action"
        icon="time-time-history-24"
        :tooltip="t('bridgeHistory.showHistory')"
        tooltip-placement="bottom-end"
        @click="handleViewTransactionsHistory"
      />
    </generic-page-header>

    <div class="transaction-content">
      <div class="header">
        <div v-loading="isTxPending" :class="headerIconClasses" />
        <h5 class="header-details">
          <formatted-amount
            class="info-line-value"
            value-can-be-hidden
            :value="formattedAmount"
            :asset-symbol="assetSymbol"
          >
            <i :class="`network-icon network-icon--${getNetworkIcon(isOutgoing ? 0 : externalNetworkId)}`" />
          </formatted-amount>
          <span class="header-details-separator">{{ t('bridgeTransaction.for') }}</span>
          <formatted-amount
            class="info-line-value"
            value-can-be-hidden
            :value="formattedAmountReceived"
            :asset-symbol="assetSymbol"
          >
            <i :class="`network-icon network-icon--${getNetworkIcon(isOutgoing ? externalNetworkId : 0)}`" />
          </formatted-amount>
        </h5>
      </div>

      <div v-if="txExternalAccount" class="transaction-hash-container transaction-hash-container--with-dropdown">
        <s-input :placeholder="txExternalAccountPlaceholder" :value="txExternalAccountFormatted" readonly />
        <s-button
          class="s-button--hash-copy"
          type="action"
          alternative
          icon="basic-copy-24"
          :tooltip="txExternalAccountCopyTooltip"
          @click="handleCopyAddress(txExternalAccount, $event)"
        />
        <bridge-links-dropdown v-if="externalAccountLinks.length" :links="externalAccountLinks" />
      </div>

      <info-line :class="failedClass" :label="t('bridgeTransaction.networkInfo.status')" :value="transactionStatus" />
      <info-line :label="t('bridgeTransaction.networkInfo.date')" :value="txDate" />
      <info-line
        v-if="amount"
        is-formatted
        value-can-be-hidden
        :label="t('bridgeTransaction.networkInfo.amount')"
        :value="formattedAmount"
        :asset-symbol="assetSymbol"
        :fiat-value="amountFiatValue"
      />
      <info-line
        v-if="amountReceived"
        is-formatted
        value-can-be-hidden
        :label="t('receivedText')"
        :value="formattedAmountReceived"
        :asset-symbol="assetSymbol"
        :fiat-value="amountReceivedFiatValue"
      />
      <info-line
        is-formatted
        :label="getNetworkText('bridgeTransaction.networkInfo.transactionFee')"
        :value="txSoraNetworkFeeFormatted"
        :asset-symbol="KnownSymbols.XOR"
        :fiat-value="txSoraNetworkFeeFiatValue"
      />
      <info-line
        is-formatted
        :label="
          getNetworkText(
            'bridgeTransaction.networkInfo.transactionFee',
            externalNetworkId,
            txExternalNetworkFeeApproximation
          )
        "
        :value="txExternalNetworkFeeFormatted"
        :asset-symbol="nativeTokenSymbol"
        :fiat-value="txExternalNetworkFeeFiatValue"
      />
      <info-line
        v-if="txExternalTransferFeeNotZero"
        is-formatted
        :label="t('bridge.externalTransferFee', { network: externalNetworkName })"
        :value="txExternalTransferFeeFormatted"
        :asset-symbol="assetSymbol"
        :fiat-value="txExternalTransferFeeFiatValue"
      />

      <div v-if="txInternalHash" class="transaction-hash-container transaction-hash-container--with-dropdown">
        <s-input
          :placeholder="getNetworkText('bridgeTransaction.transactionHash')"
          :value="txInternalHashFormatted"
          readonly
        />
        <s-button
          class="s-button--hash-copy"
          type="action"
          alternative
          icon="basic-copy-24"
          :tooltip="hashCopyTooltip"
          @click="handleCopyAddress(txInternalHash, $event)"
        />
        <bridge-links-dropdown v-if="soraExplorerLinks.length" :links="soraExplorerLinks" />
      </div>

      <div v-if="txParachainBlockId" class="transaction-hash-container transaction-hash-container--with-dropdown">
        <s-input
          :placeholder="getNetworkText('transaction.blockId', parachainNetworkId)"
          :value="txParachainBlockIdFormatted"
          readonly
        />
        <s-button
          class="s-button--hash-copy"
          type="action"
          alternative
          icon="basic-copy-24"
          :tooltip="hashCopyTooltip"
          @click="handleCopyAddress(txParachainBlockId, $event)"
        />
        <bridge-links-dropdown v-if="parachainExplorerLinks.length" :links="parachainExplorerLinks" />
      </div>

      <div v-if="txExternalHash" class="transaction-hash-container transaction-hash-container--with-dropdown">
        <s-input :placeholder="txExternalHashPlaceholder" :value="txExternalHashFormatted" readonly />
        <s-button
          class="s-button--hash-copy"
          type="action"
          alternative
          icon="basic-copy-24"
          :tooltip="hashCopyTooltip"
          @click="handleCopyAddress(txExternalHash, $event)"
        />
        <bridge-links-dropdown v-if="externalExplorerLinks.length" :links="externalExplorerLinks" />
      </div>

      <s-button
        v-if="!txIsFinilized"
        type="primary"
        class="s-typograhy-button--big"
        :disabled="confirmationButtonDisabled"
        @click="handleTransaction"
      >
        <template v-if="confirmationBlocksLeft">
          {{ t('bridgeTransaction.blocksLeft', { count: confirmationBlocksLeft }) }}
        </template>
        <template v-else-if="txWaitingForApprove">{{
          t('bridgeTransaction.allowToken', { tokenSymbol: assetSymbol })
        }}</template>
        <template v-else-if="isTxPending">{{ t('bridgeTransaction.pending') }}</template>
        <template v-else-if="isAnotherEvmAddress">{{ t('changeAccountText') }}</template>
        <template v-else-if="!(isOutgoing || isValidNetwork)">{{ t('changeNetworkText') }}</template>
        <template v-else-if="isInsufficientBalance">{{
          t('insufficientBalanceText', { tokenSymbol: assetSymbol })
        }}</template>
        <template v-else-if="isInsufficientXorForFee">{{
          t('insufficientBalanceText', { tokenSymbol: KnownSymbols.XOR })
        }}</template>
        <template v-else-if="isInsufficientEvmNativeTokenForFee">{{
          t('insufficientBalanceText', { tokenSymbol: nativeTokenSymbol })
        }}</template>
        <template v-else-if="isGreaterThanMaxAmount">
          {{ t('exceededAmountText', { amount: t('maxAmountText') }) }}
        </template>
        <template v-else-if="isLowerThanMinAmount">
          {{ t('exceededAmountText', { amount: t('minAmountText') }) }}
        </template>
        <template v-else-if="isTxWaiting">{{ t('confirmTransactionText') }}</template>
        <template v-else-if="isTxFailed && txIsUnsigned">{{ t('retryText') }}</template>
      </s-button>

      <div v-if="txWaitingForApprove" class="transaction-approval-text">
        {{ t('bridgeTransaction.approveToken') }}
      </div>
    </div>
    <s-button v-if="txIsFinilized" class="s-typography-button--large" type="secondary" @click="navigateToBridge">
      {{ t('bridgeTransaction.newTransaction') }}
    </s-button>
  </div>
</template>

<script lang="ts">
import { KnownSymbols } from '@sora-substrate/util/build/assets/consts';
import { BridgeTxStatus, BridgeNetworkType } from '@sora-substrate/util/build/bridgeProxy/consts';
import { components, mixins, getExplorerLinks, WALLET_CONSTS } from '@soramitsu/soraneo-wallet-web';
import { Component, Mixins } from 'vue-property-decorator';

import BridgeMixin from '@/components/mixins/BridgeMixin';
import BridgeTransactionMixin from '@/components/mixins/BridgeTransactionMixin';
import NetworkFormatterMixin from '@/components/mixins/NetworkFormatterMixin';
import { Components, PageNames, ZeroStringValue } from '@/consts';
import router, { lazyComponent } from '@/router';
import { action, state, getter, mutation } from '@/store/decorators';
import { hasInsufficientBalance, hasInsufficientXorForFee, hasInsufficientNativeTokenForFee } from '@/utils';
import { isOutgoingTransaction, isUnsignedTx } from '@/utils/bridge/common/utils';
import { subBridgeApi } from '@/utils/bridge/sub/api';

import type { CodecString, IBridgeTransaction } from '@sora-substrate/util';
import type { SubNetwork, SubHistory } from '@sora-substrate/util/build/bridgeProxy/sub/types';
import type { BridgeNetworkId } from '@sora-substrate/util/build/bridgeProxy/types';

const FORMATTED_HASH_LENGTH = 24;

@Component({
  components: {
    GenericPageHeader: lazyComponent(Components.GenericPageHeader),
    ConfirmBridgeTransactionDialog: lazyComponent(Components.ConfirmBridgeTransactionDialog),
    BridgeLinksDropdown: lazyComponent(Components.BridgeLinksDropdown),
    FormattedAmount: components.FormattedAmount,
    InfoLine: components.InfoLine,
  },
})
export default class BridgeTransaction extends Mixins(
  mixins.FormattedAmountMixin,
  mixins.CopyAddressMixin,
  BridgeMixin,
  BridgeTransactionMixin,
  NetworkFormatterMixin
) {
  readonly KnownSymbols = KnownSymbols;

  @state.bridge.externalBlockNumber private externalBlockNumber!: number;
  @state.bridge.waitingForApprove private waitingForApprove!: Record<string, boolean>;
  @state.bridge.inProgressIds private inProgressIds!: Record<string, boolean>;
  @state.router.prev private prevRoute!: Nullable<PageNames>;

  @getter.bridge.historyItem private historyItem!: Nullable<IBridgeTransaction>;
  @getter.bridge.externalAccountFormatted private externalAccountFormatted!: string;

  @action.bridge.removeHistory private removeHistory!: ({ tx, force }: { tx: any; force?: boolean }) => Promise<void>;
  @action.bridge.handleBridgeTransaction private handleBridgeTransaction!: (id: string) => Promise<void>;
  @mutation.bridge.setHistoryId private setHistoryId!: (id?: string) => void;

  get viewInEtherscan(): string {
    return this.t('transaction.viewIn', { explorer: this.TranslationConsts.Etherscan });
  }

  get txIsUnsigned(): boolean {
    if (!this.historyItem?.id) return false;

    return isUnsignedTx(this.historyItem);
  }

  get txInProcess(): boolean {
    if (!this.historyItem?.id) return false;

    return this.historyItem.id in this.inProgressIds;
  }

  get txWaitingForApprove(): boolean {
    if (!this.historyItem?.id) return false;

    return this.historyItem.id in this.waitingForApprove;
  }

  get amount(): string {
    return this.historyItem?.amount ?? '';
  }

  get amountReceived(): string {
    return this.historyItem?.amount2 ?? this.amount;
  }

  get amountFiatValue(): Nullable<string> {
    return this.asset ? this.getFiatAmountByString(this.amount, this.asset) : null;
  }

  get amountReceivedFiatValue(): Nullable<string> {
    return this.asset ? this.getFiatAmountByString(this.amountReceived, this.asset) : null;
  }

  get isOutgoing(): boolean {
    return isOutgoingTransaction(this.historyItem);
  }

  get formattedAmount(): string {
    return this.amount && this.asset ? this.formatStringValue(this.amount, this.asset.decimals) : '';
  }

  get formattedAmountReceived(): string {
    return this.amountReceived && this.asset ? this.formatStringValue(this.amountReceived, this.asset.decimals) : '';
  }

  get assetSymbol(): string {
    return this.asset?.symbol ?? '';
  }

  get externalNetworkId(): Nullable<BridgeNetworkId> {
    return this.historyItem?.externalNetwork;
  }

  get externalNetworkType(): Nullable<BridgeNetworkType> {
    return this.historyItem?.externalNetworkType;
  }

  get parachainNetworkId(): Nullable<SubNetwork> {
    try {
      return subBridgeApi.getSoraParachain(this.externalNetworkId as SubNetwork);
    } catch {
      return null;
    }
  }

  get txSoraNetworkFee(): CodecString {
    return this.historyItem?.soraNetworkFee ?? this.soraNetworkFee;
  }

  get txSoraNetworkFeeFormatted(): string {
    return this.formatCodecNumber(this.txSoraNetworkFee, this.xor?.decimals);
  }

  get txSoraNetworkFeeFiatValue(): Nullable<string> {
    return this.getFiatAmountByCodecString(this.txSoraNetworkFee);
  }

  get txExternalNetworkFee(): CodecString {
    return this.historyItem?.externalNetworkFee ?? this.externalNetworkFee;
  }

  get txExternalNetworkFeeFormatted(): string {
    return this.formatCodecNumber(this.txExternalNetworkFee, this.nativeTokenDecimals);
  }

  get txExternalNetworkFeeApproximation(): boolean {
    if (this.txExternalNetworkFeeFormatted === ZeroStringValue) return false;

    return !this.historyItem?.externalNetworkFee;
  }

  get txExternalNetworkFeeFiatValue(): Nullable<string> {
    return this.nativeToken ? this.getFiatAmountByCodecString(this.txExternalNetworkFee, this.nativeToken) : null;
  }

  get txExternalTransferFee(): CodecString {
    return (this.historyItem as SubHistory)?.externalTransferFee ?? ZeroStringValue;
  }

  get txExternalTransferFeeFormatted(): string {
    return this.formatCodecNumber(this.txExternalTransferFee, this.asset?.externalDecimals);
  }

  get txExternalTransferFeeNotZero(): boolean {
    return this.txExternalTransferFee !== ZeroStringValue;
  }

  get txExternalTransferFeeFiatValue(): Nullable<string> {
    return this.asset ? this.getFiatAmountByCodecString(this.txExternalTransferFee, this.asset) : null;
  }

  get txId(): Nullable<string> {
    return this.isOutgoing ? this.txSoraId : this.txExternalHash;
  }

  get txSoraId(): string {
    return this.historyItem?.txId ?? '';
  }

  get txSoraBlockId(): string {
    return this.historyItem?.blockId ?? '';
  }

  get txSoraHash(): string {
    return this.historyItem?.hash ?? '';
  }

  get txInternalHash(): string {
    if (!this.isOutgoing) return this.txSoraHash;

    return this.txSoraHash || this.txSoraBlockId || this.txSoraId;
  }

  get txInternalHashFormatted(): string {
    return this.formatAddress(this.txInternalHash, FORMATTED_HASH_LENGTH);
  }

  get txExternalBlockId(): string {
    return this.historyItem?.externalBlockId ?? '';
  }

  get txExternalHash(): string {
    return this.historyItem?.externalHash ?? this.txExternalBlockId;
  }

  get txExternalHashPlaceholder(): string {
    const key = this.historyItem?.externalHash ? 'bridgeTransaction.transactionHash' : 'transaction.blockId';

    return this.getNetworkText(key, this.externalNetworkId);
  }

  get txExternalHashFormatted(): string {
    return this.formatAddress(this.txExternalHash, FORMATTED_HASH_LENGTH);
  }

  get txParachainBlockId(): string {
    return (this.historyItem as SubHistory)?.parachainBlockId ?? '';
  }

  get txParachainBlockIdFormatted(): string {
    return this.formatAddress(this.txParachainBlockId, FORMATTED_HASH_LENGTH);
  }

  get txDate(): string {
    return this.formatDatetime(this.historyItem);
  }

  get txState(): string {
    return this.historyItem?.transactionState ?? BridgeTxStatus.Pending;
  }

  get isTxFailed(): boolean {
    return this.isFailedState(this.historyItem);
  }

  get isTxCompleted(): boolean {
    return this.isSuccessState(this.historyItem);
  }

  get isTxWaiting(): boolean {
    return this.isWaitingForAction(this.historyItem);
  }

  get isTxPending(): boolean {
    return !this.isTxFailed && !this.isTxCompleted;
  }

  get txIsFinilized(): boolean {
    return !this.isTxPending && !this.isTxWaiting && !this.txIsUnsigned;
  }

  get headerIconClasses(): string {
    const iconClass = 'header-icon';
    const classes = [iconClass];

    if (this.isTxWaiting) {
      classes.push(`${iconClass}--wait`);
    } else if (this.isTxFailed) {
      classes.push(`${iconClass}--error`);
    } else if (this.isTxCompleted) {
      classes.push(`${iconClass}--success`);
    } else {
      classes.push(`${iconClass}--wait`);
    }

    return classes.join(' ');
  }

  get transactionStatus(): string {
    if (this.txIsUnsigned || this.isTxWaiting) {
      return this.t('bridgeTransaction.statuses.waitingForConfirmation');
    }
    if (this.isTxFailed) {
      return this.t('bridgeTransaction.statuses.failed');
    }
    if (this.isTxCompleted) {
      return this.t('bridgeTransaction.statuses.done');
    }

    return this.t('bridgeTransaction.statuses.pending') + '...';
  }

  get txExternalAccount(): string {
    return this.historyItem?.to ?? '';
  }

  get txExternalAccountFormatted(): string {
    return this.formatAddress(this.txExternalAccount, FORMATTED_HASH_LENGTH);
  }

  get txExternalAccountPlaceholder(): string {
    const network = this.isEvmTxType || this.isOutgoing ? this.externalNetworkId : undefined;
    return this.getNetworkText('accountAddressText', network);
  }

  get txExternalAccountCopyTooltip(): string {
    return this.copyTooltip(this.txExternalAccountPlaceholder);
  }

  get isGreaterThanMaxAmount(): boolean {
    return this.txIsUnsigned && this.isGreaterThanTransferMaxAmount(this.amount, this.asset, this.isOutgoing);
  }

  get isLowerThanMinAmount(): boolean {
    return this.txIsUnsigned && this.isLowerThanTransferMinAmount(this.amount, this.asset, this.isOutgoing);
  }

  get isInsufficientBalance(): boolean {
    const fee = this.isOutgoing ? this.txSoraNetworkFee : this.txExternalNetworkFee;

    if (!this.asset || !this.amount || !fee) return false;

    return this.txIsUnsigned && hasInsufficientBalance(this.asset, this.amount, fee, !this.isOutgoing);
  }

  get isInsufficientXorForFee(): boolean {
    return this.txIsUnsigned && hasInsufficientXorForFee(this.xor, this.txSoraNetworkFee);
  }

  get isInsufficientEvmNativeTokenForFee(): boolean {
    return (
      ((this.txIsUnsigned && !this.isOutgoing) || (!this.txIsUnsigned && this.isOutgoing)) &&
      hasInsufficientNativeTokenForFee(this.externalNativeBalance, this.txExternalNetworkFee)
    );
  }

  get isEvmTxType(): boolean {
    return (
      !!this.externalNetworkType && [BridgeNetworkType.Eth, BridgeNetworkType.Evm].includes(this.externalNetworkType)
    );
  }

  get isAnotherEvmAddress(): boolean {
    if (!this.isEvmTxType) return false;

    return this.txExternalAccount.toLowerCase() !== this.externalAccountFormatted.toLowerCase();
  }

  get confirmationButtonDisabled(): boolean {
    return (
      !(this.isOutgoing || this.isValidNetwork) ||
      this.isAnotherEvmAddress ||
      this.isInsufficientBalance ||
      this.isGreaterThanMaxAmount ||
      this.isLowerThanMinAmount ||
      this.isInsufficientXorForFee ||
      this.isInsufficientEvmNativeTokenForFee ||
      this.isTxPending
    );
  }

  get hashCopyTooltip(): string {
    return this.copyTooltip(this.t('bridgeTransaction.transactionHash'));
  }

  get externalNetworkName(): string {
    return this.externalNetworkType && this.externalNetworkId
      ? this.getNetworkName(this.externalNetworkType, this.externalNetworkId)
      : '';
  }

  getNetworkText(key: string, networkId?: Nullable<BridgeNetworkId>, approximate = false): string {
    const text = this.t(key);
    const network = networkId ? this.getNetworkName(this.externalNetworkType, networkId) : this.TranslationConsts.Sora;
    const approx = approximate ? this.TranslationConsts.Max : '';

    return [approx, network, text].filter((item) => !!item).join(' ');
  }

  get soraExplorerLinks(): Array<WALLET_CONSTS.ExplorerLink> {
    if (!this.soraNetwork) {
      return [];
    }
    const baseLinks = getExplorerLinks(this.soraNetwork);
    const txId = this.txSoraId || this.txSoraBlockId;
    if (!(baseLinks.length && txId)) {
      return [];
    }
    if (!this.txSoraId) {
      // txId is block
      return baseLinks.map(({ type, value }) => {
        const link = { type } as WALLET_CONSTS.ExplorerLink;
        if (type === WALLET_CONSTS.ExplorerType.Polkadot) {
          link.value = `${value}/${txId}`;
        } else {
          link.value = `${value}/block/${txId}`;
        }
        return link;
      });
    }
    return baseLinks
      .map(({ type, value }) => {
        const link = { type } as WALLET_CONSTS.ExplorerLink;
        if (type === WALLET_CONSTS.ExplorerType.Sorascan) {
          link.value = `${value}/transaction/${txId}`;
        } else if (type === WALLET_CONSTS.ExplorerType.Subscan) {
          link.value = `${value}/extrinsic/${txId}`;
        } else if (this.txSoraBlockId) {
          // ExplorerType.Polkadot
          link.value = `${value}/${this.txSoraBlockId}`;
        }
        return link;
      })
      .filter((value) => !!value.value); // Polkadot explorer won't be shown without block
  }

  get externalAccountLinks(): Array<WALLET_CONSTS.ExplorerLink> {
    if (!(this.externalNetworkType && this.externalNetworkId)) return [];

    return this.getNetworkExplorerLinks(
      this.externalNetworkType,
      this.externalNetworkId,
      this.txExternalAccount,
      this.txExternalBlockId,
      this.EvmLinkType.Account
    );
  }

  get parachainExplorerLinks(): Array<WALLET_CONSTS.ExplorerLink> {
    if (!(this.externalNetworkType && this.parachainNetworkId)) return [];

    return this.getNetworkExplorerLinks(
      this.externalNetworkType,
      this.parachainNetworkId,
      this.txParachainBlockId,
      this.txParachainBlockId,
      this.EvmLinkType.Transaction
    );
  }

  get externalExplorerLinks(): Array<WALLET_CONSTS.ExplorerLink> {
    if (!(this.externalNetworkType && this.externalNetworkId)) return [];

    return this.getNetworkExplorerLinks(
      this.externalNetworkType,
      this.externalNetworkId,
      this.txExternalHash,
      this.txExternalBlockId,
      this.EvmLinkType.Transaction
    );
  }

  async created(): Promise<void> {
    if (!this.historyItem) {
      this.navigateToBridge();
      return;
    }

    await this.withParentLoading(async () => {
      const withAutoStart = !this.txInProcess && this.isTxPending;

      await this.handleTransaction(withAutoStart);
    });
  }

  beforeDestroy(): void {
    if (!this.txInProcess && this.txIsUnsigned) {
      const tx = { ...this.historyItem };
      this.removeHistory({ tx, force: true });
    }

    // reset active history item
    this.setHistoryId();
  }

  get confirmationBlocksLeft(): number {
    if (this.isOutgoing || !this.historyItem?.externalBlockHeight || !this.externalBlockNumber) return 0;
    if (!Number.isFinite(this.historyItem?.externalBlockHeight)) return 0;

    const blocksLeft = +this.historyItem.externalBlockHeight + 30 - this.externalBlockNumber;

    return Math.max(blocksLeft, 0);
  }

  get failedClass(): string {
    return this.isTxFailed && !this.isTxWaiting ? 'info-line--error' : '';
  }

  async handleTransaction(withAutoStart = true): Promise<void> {
    if (withAutoStart && this.historyItem?.id) {
      await this.handleBridgeTransaction(this.historyItem.id);
    }
  }

  handleBack(): void {
    router.push({ name: this.prevRoute as string | undefined });
  }
}
</script>

<style lang="scss">
$header-icon-size: 52px;
$header-spinner-size: 62px;
$header-font-size: var(--s-heading3-font-size);

.transaction {
  &-container {
    @include bridge-container;
  }
  &-content {
    @include collapse-items;
    .header {
      &-details .info-line-value {
        .formatted-amount {
          &__integer,
          &__symbol {
            font-size: $header-font-size;
          }
          &__decimal {
            font-size: calc(#{$header-font-size} * 0.75) !important;
          }
        }
      }
      &-icon {
        position: relative;
        @include svg-icon('', $header-icon-size);
        .el-loading-mask {
          background-color: var(--s-color-utility-surface);
        }
        .el-loading-spinner {
          top: 0;
          margin-top: calc(#{$header-icon-size - $header-spinner-size} / 2);
          .circular {
            width: $header-spinner-size;
            height: $header-spinner-size;
          }
        }
      }
    }
    .el-button .network-title {
      text-transform: uppercase;
    }
    .info-line {
      &--error .info-line-value {
        color: var(--s-color-status-error);
        font-weight: 600;
        text-transform: uppercase;
      }
      &-label {
        font-weight: 300;
      }
    }
  }
  &-hash-container {
    .s-button--hash-copy {
      padding: 0;
      color: var(--s-color-base-content-tertiary) !important;
      .s-icon-copy {
        margin-right: 0 !important;
      }
    }
    &--with-dropdown {
      .s-button--hash-copy {
        right: calc(#{$inner-spacing-medium} + var(--s-size-mini));
      }
    }
    i {
      font-weight: 600;
      @include icon-styles;
    }
  }
}
.s-button--hash-copy {
  right: $inner-spacing-medium;
  &,
  .el-tooltip {
    &:focus {
      outline: auto;
    }
  }
}
[design-system-theme='dark'] {
  .transaction-content .s-input {
    background-color: var(--s-color-base-on-accent);
  }
}
</style>

<style lang="scss" scoped>
$network-title-max-width: 250px;

.transaction {
  &-container {
    flex-direction: column;
    align-items: center;
    margin-top: $inner-spacing-large;
    margin-right: auto;
    margin-left: auto;
    &.el-loading-parent--relative .transaction-content {
      min-height: $bridge-height;
    }
  }
  &-content .el-button,
  &-container .s-typography-button--large {
    width: 100%;
    margin-top: $inner-spacing-medium;
  }
  &-content {
    @include bridge-content(285px);
    margin-top: $inner-spacing-big;

    & > *:not(:first-child) {
      margin-top: $inner-spacing-medium;
    }
  }

  &-hash-container {
    position: relative;

    .s-button--hash-copy {
      position: absolute;
      z-index: $app-content-layer;
      top: 0;
      bottom: 0;
      margin-top: auto;
      margin-bottom: auto;
      padding: 0;
      width: var(--s-size-mini);
      height: var(--s-size-mini);
      line-height: 1;
    }
  }
  &-error {
    color: var(--s-color-status-error);
    display: flex;
    flex-flow: column nowrap;
    padding: 0 $inner-spacing-tiny;
    margin-bottom: $inner-spacing-medium;
    line-height: var(--s-line-height-mini);
    text-align: left;

    &__title {
      margin-bottom: $inner-spacing-tiny;
      text-transform: uppercase;
      font-weight: 300;
    }
    &__value {
      font-weight: 400;
    }
  }
  &-approval-text {
    margin-top: $inner-spacing-medium;
    font-size: var(--s-font-size-mini);
  }
}
.header {
  margin-bottom: $inner-spacing-medium;
  text-align: center;
  &-icon {
    margin: $inner-spacing-medium auto;
    &--success {
      background-image: url('~@/assets/img/status-success.svg');
      background-size: 110%;
    }
    &--wait {
      background-image: url('~@/assets/img/header-wait.svg');
    }
    &--error {
      background-image: url('~@/assets/img/header-error.svg');
      background-size: 125%;
    }
    &.el-loading-parent--relative {
      background-image: none;
    }
  }
  &-details {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: $inner-spacing-mini;
    font-weight: 700;
    line-height: var(--s-line-height-medium);
    .network-icon {
      margin-left: calc(#{$inner-spacing-mini} / 4);
    }
    &-separator {
      margin-right: $inner-spacing-tiny;
      margin-left: $inner-spacing-tiny;
      font-size: var(--s-heading3-font-size);
      font-weight: 300;
    }
  }
}
</style>
