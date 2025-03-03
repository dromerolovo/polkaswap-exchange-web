<template>
  <transaction-details :info-only="infoOnly">
    <div class="swap-info-container">
      <info-line v-for="{ id, label, value } in priceValues" :key="id" :label="label" :value="value" />
      <info-line
        :label="t(`swap.${isExchangeB ? 'maxSold' : 'minReceived'}`)"
        :label-tooltip="t('swap.minReceivedTooltip')"
        :value="formattedMinMaxReceived"
        :asset-symbol="getAssetSymbolText"
        :fiat-value="getFiatAmountByCodecString(minMaxReceived, isExchangeB ? tokenFrom : tokenTo)"
        is-formatted
      />
      <info-line v-for="(reward, index) in rewardsValues" :key="index" v-bind="reward" />
      <info-line :label="t('swap.priceImpact')" :label-tooltip="t('swap.priceImpactTooltip')">
        <value-status-wrapper :value="priceImpact">
          <formatted-amount class="swap-value" :value="priceImpactFormatted">%</formatted-amount>
        </value-status-wrapper>
      </info-line>
      <info-line :label="t('swap.route')">
        <div class="swap-route">
          <swap-distribution>
            <s-icon class="el-tooltip" name="info-16" size="14px" />
          </swap-distribution>

          <div class="swap-route-paths s-flex">
            <div v-for="(token, index) in swapRoute" class="swap-route-value" :key="token">
              <span>{{ token }}</span>
              <s-icon v-if="index !== swapRoute.length - 1" name="el-icon el-icon-arrow-right swap-route-icon" />
            </div>
          </div>
        </div>
      </info-line>
      <info-line
        :label="t('swap.liquidityProviderFee')"
        :label-tooltip="liquidityProviderFeeTooltipText"
        :value="formattedLiquidityProviderFee"
        :asset-symbol="xorSymbol"
        is-formatted
      />
      <info-line
        v-if="isLoggedIn"
        :label="t('networkFeeText')"
        :label-tooltip="t('networkFeeTooltipText')"
        :value="networkFeeFormatted"
        :asset-symbol="xorSymbol"
        :fiat-value="getFiatAmountByCodecString(networkFee)"
        is-formatted
      />
    </div>
  </transaction-details>
</template>

<script lang="ts">
import { CodecString, Operation, NetworkFeesObject } from '@sora-substrate/util';
import { XOR, KnownAssets } from '@sora-substrate/util/build/assets/consts';
import { components, mixins } from '@soramitsu/soraneo-wallet-web';
import { Component, Mixins, Prop } from 'vue-property-decorator';

import TranslationMixin from '@/components/mixins/TranslationMixin';
import { Components } from '@/consts';
import { lazyComponent } from '@/router';
import { getter, state } from '@/store/decorators';

import type { LPRewardsInfo } from '@sora-substrate/liquidity-proxy/build/types';
import type { AccountAsset } from '@sora-substrate/util/build/assets/types';

type PriceValue = {
  id: 'from' | 'to';
  label: string;
  value: string;
};

type RewardValue = {
  value: string;
  fiatValue: Nullable<string>;
  assetSymbol: string;
  label: string;
};

@Component({
  components: {
    ValueStatusWrapper: lazyComponent(Components.ValueStatusWrapper),
    TransactionDetails: lazyComponent(Components.TransactionDetails),
    SwapDistribution: lazyComponent(Components.SwapDistribution),
    FormattedAmount: components.FormattedAmount,
    InfoLine: components.InfoLine,
  },
})
export default class SwapTransactionDetails extends Mixins(mixins.FormattedAmountMixin, TranslationMixin) {
  @state.wallet.settings.networkFees private networkFees!: NetworkFeesObject;
  @state.swap.liquidityProviderFee private liquidityProviderFee!: CodecString;
  @state.swap.rewards private rewards!: Array<LPRewardsInfo>;
  @state.swap.route private route!: Array<string>;
  @state.swap.isExchangeB isExchangeB!: boolean;

  @getter.swap.price private price!: string;
  @getter.swap.priceReversed private priceReversed!: string;
  @getter.wallet.account.isLoggedIn isLoggedIn!: boolean;
  @getter.swap.tokenFrom tokenFrom!: AccountAsset;
  @getter.swap.tokenTo tokenTo!: AccountAsset;
  @getter.swap.minMaxReceived minMaxReceived!: CodecString;
  @getter.swap.priceImpact priceImpact!: string;

  @getter.assets.assetDataByAddress private getAsset!: (addr?: string) => Nullable<AccountAsset>;

  @Prop({ default: true, type: Boolean }) readonly infoOnly!: boolean;

  get liquidityProviderFeeTooltipText(): string {
    return this.t('swap.liquidityProviderFeeTooltip', { liquidityProviderFee: this.liquidityProviderFeeValue });
  }

  get swapRoute(): Array<string> {
    return this.route.map((assetId) => this.getAsset(assetId)?.symbol ?? '?');
  }

  get priceValues(): Array<PriceValue> {
    const fromSymbol = this.tokenFrom?.symbol ?? '';
    const toSymbol = this.tokenTo?.symbol ?? '';

    return [
      {
        id: 'from',
        label: this.t('firstPerSecond', { first: fromSymbol, second: toSymbol }),
        value: this.formatStringValue(this.price),
      },
      {
        id: 'to',
        label: this.t('firstPerSecond', { first: toSymbol, second: fromSymbol }),
        value: this.formatStringValue(this.priceReversed),
      },
    ];
  }

  get priceImpactFormatted(): string {
    return this.formatStringValue(this.priceImpact);
  }

  get rewardsValues(): Array<RewardValue> {
    return this.rewards.map((reward, index) => {
      const asset = KnownAssets.get(reward.currency);
      const value = this.formatCodecNumber(reward.amount);

      return {
        value,
        fiatValue: this.getFiatAmountByString(value, asset as AccountAsset),
        assetSymbol: asset?.symbol ?? '',
        label: index === 0 ? this.t('swap.rewardsForSwap') : '',
      };
    });
  }

  get networkFee(): CodecString {
    return this.networkFees[Operation.Swap];
  }

  get networkFeeFormatted(): string {
    return this.formatCodecNumber(this.networkFee);
  }

  get liquidityProviderFeeValue(): string {
    return this.formatStringValue('0.3');
  }

  get formattedLiquidityProviderFee(): string {
    return this.formatCodecNumber(this.liquidityProviderFee);
  }

  get formattedMinMaxReceived(): string {
    const decimals = (this.isExchangeB ? this.tokenFrom : this.tokenTo)?.decimals;
    return this.formatCodecNumber(this.minMaxReceived, decimals);
  }

  get xorSymbol(): string {
    return ' ' + XOR.symbol;
  }

  get getAssetSymbolText(): string {
    return (this.isExchangeB ? this.tokenFrom : this.tokenTo)?.symbol ?? '';
  }
}
</script>

<style lang="scss" scoped>
.swap-route {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $inner-spacing-mini;
  width: 100%;

  &-value {
    font-weight: 600;
  }

  &-icon {
    color: var(--s-color-base-content-primary) !important;
    font-size: 12px !important;
    margin: 0 !important;
  }
}
</style>
