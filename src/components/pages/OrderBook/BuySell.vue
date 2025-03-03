<template>
  <div class="order-book order-books">
    <el-popover popper-class="order-book-whitelist" trigger="click" v-model="visibleBookList" :visible-arrow="false">
      <pair-list-popover @close="toggleBookList" />
      <div slot="reference">
        <div class="order-book-choose-pair">
          <div>TOKEN PAIR</div>
          <div class="order-book-choose-btn">
            <div class="order-book-pair-name">
              <pair-token-logo :first-token="baseAsset" :second-token="quoteAsset" />
              <span v-if="baseAsset && quoteAsset">{{ `${baseSymbol}-${quoteSymbol}` }}</span>
            </div>
            <s-icon :name="icon" class="order-book-choose-btn-icon" />
          </div>
          <div class="delimiter" />
          <div class="order-book-pair-data">
            <div class="order-book-pair-data-item">
              <span>Price</span>
              <span class="order-book-pair-data-item__value order-book-fiat">
                <formatted-amount :value="orderBookPrice" />
              </span>
            </div>
            <div class="order-book-pair-data-item">
              <span>Change</span>
              <span class="order-book-pair-data-item__value">
                <price-change :value="orderBookPriceChange" />
              </span>
            </div>
            <div class="order-book-pair-data-item">
              <span>1D Volume</span>
              <span class="order-book-pair-data-item__value">
                <formatted-amount :value="orderBookVolume" is-fiat-value />
              </span>
            </div>
          </div>
        </div>
      </div>
    </el-popover>

    <s-tabs class="order-book__tab" v-model="limitOrderType" type="rounded" @click="handleTabClick">
      <s-tab label="limit" name="limit">
        <span slot="label">
          <span>{{ 'Limit' }}</span>
          <s-tooltip slot="suffix" border-radius="mini" :content="limitTooltip" placement="top" tabindex="-1">
            <s-icon name="info-16" size="14px" />
          </s-tooltip>
        </span>
      </s-tab>
      <s-tab label="market" name="market" :disabled="marketOptionDisabled">
        <span slot="label">
          <span>{{ 'Market' }}</span>
          <s-tooltip slot="suffix" border-radius="mini" :content="marketTooltip" placement="top" tabindex="-1">
            <s-icon name="info-16" size="14px" />
          </s-tooltip>
        </span>
      </s-tab>
    </s-tabs>

    <token-input
      :balance="getTokenBalance(quoteAsset)"
      :is-max-available="false"
      :title="'price'"
      :token="quoteAsset"
      :value="quoteValue"
      :disabled="isPriceInputDisabled"
      @input="handleInputFieldQuote"
      class="order-book-input"
    />

    <token-input
      :balance="getTokenBalance(baseAsset)"
      :is-max-available="isMaxAmountAvailable"
      :with-slider="isSliderAvailable"
      :title="'Amount'"
      :token="baseAsset"
      :value="baseValue"
      :slider-value="sliderValue"
      @slide="handleSlideInputChange"
      @input="handleInputFieldBase"
      @max="handleMaxValue"
      class="order-book-input s-input--with-slider"
    />

    <div class="order-book-total">
      <span class="order-book-total-title">TOTAL</span>
      <div class="order-book-total-value">
        <span class="order-book-total-value-amount">{{ amountAtPrice }}</span>
      </div>
    </div>

    <el-popover popper-class="book-validation__popover" trigger="hover" :visible-arrow="false">
      <div v-if="hasExplainableError" class="book-validation">
        <div class="book-validation__disclaimer">
          <h4 class="book-validation__disclaimer-header">
            {{ reason }}
          </h4>
          <p class="book-validation__disclaimer-paragraph">
            {{ reading }}
          </p>
          <div class="book-validation__disclaimer-warning icon">
            <s-icon name="notifications-alert-triangle-24" size="28px" />
          </div>
        </div>
      </div>
      <s-button
        slot="reference"
        type="primary"
        class="btn s-typography-button--medium"
        :class="computedBtnClass"
        @click="placeLimitOrder"
        :disabled="buttonDisabled"
      >
        <span> {{ t(buttonText) }}</span>
        <s-icon v-if="hasExplainableError" name="info-16" class="book-inform-icon-btn" />
      </s-button>
    </el-popover>

    <place-transaction-details
      v-if="areTokensSelected && !hasZeroAmount && !hasExplainableError"
      class="info-line-container"
      :info-only="false"
      :is-market-type="isMarketType"
    />

    <place-confirm
      :visible.sync="confirmPlaceOrderVisibility"
      :isInsufficientBalance="isInsufficientBalance"
      :isBuySide="isBuySide"
      :type="limitOrderType"
      :is-market-type="isMarketType"
      @confirm="resetValues"
    />
  </div>
</template>

<script lang="ts">
import { PriceVariant, OrderBookStatus } from '@sora-substrate/liquidity-proxy';
import { LiquiditySourceTypes } from '@sora-substrate/liquidity-proxy/build/consts';
import { FPNumber, Operation } from '@sora-substrate/util';
import { DexId } from '@sora-substrate/util/build/dex/consts';
import { MAX_TIMESTAMP } from '@sora-substrate/util/build/orderBook/consts';
import { components, mixins, api } from '@soramitsu/soraneo-wallet-web';
import { Component, Mixins, Watch } from 'vue-property-decorator';

import TranslationMixin from '@/components/mixins/TranslationMixin';
import { Components, LimitOrderType, PageNames } from '@/consts';
import router, { lazyComponent } from '@/router';
import { action, getter, mutation, state } from '@/store/decorators';
import type { OrderBookStats } from '@/types/orderBook';
import { OrderBookTabs } from '@/types/tabs';
import {
  isMaxButtonAvailable,
  getMaxValue,
  getAssetBalance,
  asZeroValue,
  hasInsufficientBalance,
  delay,
} from '@/utils';
import { getBookDecimals, MAX_ORDERS_PER_SIDE, MAX_ORDERS_PER_USER } from '@/utils/orderBook';

import type { OrderBook, OrderBookPriceVolume } from '@sora-substrate/liquidity-proxy';
import type { CodecString, NetworkFeesObject } from '@sora-substrate/util';
import type { AccountAsset } from '@sora-substrate/util/build/assets/types';
import type { LimitOrder } from '@sora-substrate/util/build/orderBook/types';
import type { Subscription } from 'rxjs';

@Component({
  components: {
    FormattedAmount: components.FormattedAmount,
    TokenInput: lazyComponent(Components.TokenInput),
    PairTokenLogo: lazyComponent(Components.PairTokenLogo),
    PairListPopover: lazyComponent(Components.PairListPopover),
    PlaceConfirm: lazyComponent(Components.PlaceOrder),
    PlaceTransactionDetails: lazyComponent(Components.PlaceTransactionDetails),
    PriceChange: lazyComponent(Components.PriceChange),
  },
})
export default class BuySellWidget extends Mixins(TranslationMixin, mixins.FormattedAmountMixin, mixins.LoadingMixin) {
  @state.wallet.settings.networkFees private networkFees!: NetworkFeesObject;
  @state.orderBook.limitOrderType private _limitOrderType!: LimitOrderType;
  @state.orderBook.baseValue baseValue!: string;
  @state.orderBook.quoteValue quoteValue!: string;
  @state.orderBook.side side!: PriceVariant;
  @state.orderBook.asks asks!: OrderBookPriceVolume[];
  @state.orderBook.bids bids!: OrderBookPriceVolume[];
  @state.orderBook.baseAssetAddress baseAssetAddress!: string;
  @state.orderBook.amountSliderValue sliderValue!: number;
  @state.orderBook.userLimitOrders userLimitOrders!: Array<LimitOrder>;

  @getter.assets.xor private xor!: AccountAsset;
  @getter.orderBook.baseAsset baseAsset!: AccountAsset;
  @getter.orderBook.quoteAsset quoteAsset!: AccountAsset;
  @getter.orderBook.currentOrderBook currentOrderBook!: Nullable<OrderBook>;
  @getter.orderBook.orderBookStats orderBookStats!: Nullable<OrderBookStats>;
  @getter.wallet.account.isLoggedIn isLoggedIn!: boolean;
  @getter.swap.tokenFrom tokenFrom!: Nullable<AccountAsset>;
  @getter.swap.tokenTo tokenTo!: Nullable<AccountAsset>;

  @mutation.orderBook.setBaseValue setBaseValue!: (value: string) => void;
  @mutation.orderBook.setQuoteValue setQuoteValue!: (value: string) => void;
  @mutation.orderBook.setAmountSliderValue setAmountSliderValue!: (value: number) => void;
  @mutation.swap.setFromValue private setFromValue!: (value: string) => void;
  @mutation.swap.setToValue private setToValue!: (value: string) => void;
  @mutation.swap.setLiquiditySource setLiquiditySource!: (liquiditySource: string) => void;
  @mutation.swap.selectDexId private selectDexId!: (dexId: DexId) => void;
  @mutation.orderBook.setLimitOrderType private setLimitOrderType!: (type: LimitOrderType) => void;

  @action.swap.setTokenFromAddress private setTokenFromAddress!: (address?: string) => Promise<void>;
  @action.swap.setTokenToAddress private setTokenToAddress!: (address?: string) => Promise<void>;

  @action.orderBook.updateOrderBooksStats private updateOrderBooksStats!: AsyncFnWithoutArgs;

  visibleBookList = false;
  confirmPlaceOrderVisibility = false;
  confirmCancelOrderVisibility = false;
  limitForSinglePriceReached = false;
  quoteSubscription: Nullable<Subscription> = null;
  timestamp = MAX_TIMESTAMP;
  marketQuotePrice = '';
  reason = '';
  reading = '';

  readonly OrderBookTabs = OrderBookTabs;

  @Watch('side')
  @Watch('baseAssetAddress')
  private handleSideChange(): void {
    this.handleTabClick();
  }

  @Watch('baseAsset')
  @Watch('quoteAsset')
  private setTokens(): void {
    if (!this.baseAsset || !this.quoteAsset) return;

    if (this.isBuySide) {
      this.setTokenFromAddress(this.quoteAsset.address);
      this.setTokenToAddress(this.baseAsset.address);
    } else {
      this.setTokenFromAddress(this.baseAsset.address);
      this.setTokenToAddress(this.quoteAsset.address);
    }
  }

  @Watch('visibleBookList')
  private updateStats(): void {
    this.resetValues();
    if (this.visibleBookList) {
      this.updateOrderBooksStats();
    }
  }

  @Watch('marketQuotePrice')
  @Watch('userLimitOrders')
  private checkValidation(): void {
    this.checkInputValidation();
  }

  get limitOrderType(): LimitOrderType {
    return this._limitOrderType;
  }

  set limitOrderType(type: LimitOrderType) {
    this.setLimitOrderType(type);
  }

  get networkFee(): CodecString {
    return this.networkFees[Operation.OrderBookPlaceLimitOrder];
  }

  get isSliderAvailable(): boolean {
    const availableBalance = getMaxValue(this.baseAsset, this.networkFee);
    return new FPNumber(availableBalance).gt(FPNumber.ZERO);
  }

  get isMarketType(): boolean {
    return this.limitOrderType === LimitOrderType.market;
  }

  get hasExplainableError(): boolean {
    return !!this.reason && !!this.reading;
  }

  get amountAtPrice(): string {
    if (this.buttonDisabled) return '';
    if (!this.baseValue) return '';
    if (!this.quoteValue && !this.marketQuotePrice) return '';
    return `${this.baseValue} ${this.baseSymbol} AT ${this.quoteValue || this.marketQuotePrice} ${this.quoteSymbol}`;
  }

  // TODO: [Rustem]: Refactor this function to reduce its Cognitive Complexity from 33 to the 15 allowed. [+22 locations]sonarlint(typescript:S3776)
  get buttonText(): string {
    if (!this.isLoggedIn) return 'connectWalletText';

    if (this.bookStopped) return 'book stopped';

    if (this.userReachedSpotLimit || this.userReachedOwnLimit) return "can't place order";

    if (this.isInsufficientBalance) return this.t('insufficientBalanceText', { tokenSymbol: this.tokenFrom?.symbol });

    if (this.limitOrderType === LimitOrderType.limit) {
      if (!this.quoteValue) return 'set price';
      if (!this.baseValue || this.isZeroAmount) return 'enter amount';

      // NOTE: corridor check could be enabled on blockchain later on; uncomment to return
      // if (this.isPriceTooHigh || this.isPriceTooLow || !this.isPriceBeyondPrecision) {
      //   return "can't place order";
      // }

      if (!this.isPriceBeyondPrecision) {
        return "can't place order";
      }

      if (this.orderBookStatus === OrderBookStatus.PlaceAndCancel) {
        if (this.priceExceedsSpread) return "can't place order";
      }

      if (this.limitForSinglePriceReached) return "can't place order";

      if (this.isOutOfAmountBounds) return "can't place order";

      if (this.side === PriceVariant.Buy) return `Buy ${this.baseAsset.symbol}`;
      else return `Sell ${this.baseAsset.symbol}`;
    } else {
      if (this.isZeroAmount) return 'enter amount';
      if (!this.marketQuotePrice) return "can't place order";
    }

    if (this.isOutOfAmountBounds) return "can't place order";

    if (this.isBuySide) return `Buy ${this.baseAsset.symbol}`;
    else return `Sell ${this.baseAsset.symbol}`;
  }

  setError({ reason, reading }): void {
    this.reason = reason;
    this.reading = reading;
  }

  // TODO: [Rustem] Refactor this function to reduce its Cognitive Complexity from 21 to the 15 allowed. [+14 locations]sonarlint(typescript:S3776)
  get buttonDisabled(): boolean {
    if (this.bookStopped) return true;

    if (this.userReachedSpotLimit || this.userReachedOwnLimit || this.limitForSinglePriceReached) return true;

    if (!this.isLoggedIn) return false;

    if (this.isInsufficientBalance) return true;

    if (this.limitOrderType === LimitOrderType.limit) {
      if (!this.baseValue || !this.quoteValue) return true;
      // NOTE: corridor check could be enabled on blockchain later on; uncomment to return
      // if (this.isPriceTooHigh || this.isPriceTooLow || !this.isPriceBeyondPrecision) return true;
      if (!this.isPriceBeyondPrecision) return true;

      if (this.orderBookStatus === OrderBookStatus.PlaceAndCancel) {
        if (this.priceExceedsSpread) return true;
      }
    } else {
      if (!this.baseValue) return true; // TODO: [Rustem] check with btn text
      if (!this.marketQuotePrice) return true;
    }

    return this.isOutOfAmountBounds;
  }

  // TODO: [Rustem] Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. [+15 locations]sonarlint(typescript:S3776)
  async checkInputValidation(): Promise<void> {
    this.setError({ reason: '', reading: '' });

    if (this.orderBookStatus === OrderBookStatus.Stop) return;

    if (this.userReachedSpotLimit)
      return this.setError({
        reason: 'Trading side has been filled',
        reading:
          'Price range cap: Each order book side is limited to 1024 unique price points. Please select a price within the existing range or wait for space to become available',
      });

    if (this.userReachedOwnLimit)
      return this.setError({
        reason: 'Too many orders is ongoing',
        reading:
          'Limit reached: Each account is confined to 1024 limit orders. Please wait until some of your orders fulfill',
      });

    if (this.isInsufficientBalance) return;

    // NOTE: corridor check could be enabled on blockchain later on; uncomment to return
    // if (this.isPriceTooHigh && this.quoteValue && this.baseValue)
    //   return this.setError({
    //     reason: 'Price is too far above/below the market price.',
    //     reading:
    //       'Price range alert: Your price is more than 50% above or below the current market price. Please enter a more closely aligned market price',
    //   });
    // if (this.isPriceTooLow && this.quoteValue && this.baseValue)
    //   return this.setError({
    //     reason: 'Price is too far above/below the market price.',
    //     reading:
    //       'Price range alert: Your price is more than 50% above or below the current market price. Please enter a more closely aligned market price',
    //   });

    if (!this.isPriceBeyondPrecision && this.baseValue)
      return this.setError({
        reason: 'Entered price is too precise to calculate',
        reading:
          'Precision exceeded: The amount/price entered has too many decimal places. Please input a value with fewer decimal places',
      });

    if (this.isMarketType) {
      // wait until any market quote being set to avoid error appearance
      await delay(300);

      if (!this.marketQuotePrice && !this.isZeroAmount) {
        return this.setError({
          reason: 'Not enough orders available to fullfill this order',
          reading:
            'Market order limitation: There are not enough orders available to fulfill this market limit order. Please adjust your order size or wait for more orders to be placed',
        });
      }
    }

    if (this.orderBookStatus === OrderBookStatus.PlaceAndCancel && this.priceExceedsSpread)
      return this.setError({
        reason: 'Price exceeded spread',
        reading: "Price exceeded: a market's bid or ask price exceeded its ask/bid price",
      });

    if ((await this.singlePriceReachedLimit()) && this.quoteValue)
      return this.setError({
        reason: 'Too many orders is ongoing for this price',
        reading: 'Limit reached: Each position is confined to 1024 limit orders. Please wait until some orders fulfill',
      });

    if (!this.isZeroAmount && this.isOutOfAmountBounds && this.quoteValue)
      return this.setError({
        reason: 'Amount exceeds the blockchain range',
        reading: "Blockchain range exceeded: Your entered amount falls outside the blockchain's allowed range",
      });
  }

  async singlePriceReachedLimit(): Promise<boolean> {
    const limitReached = !(await api.orderBook.isOrderPlaceable(
      this.baseAsset.address,
      this.quoteAsset.address,
      this.side,
      this.quoteValue
    ));

    this.limitForSinglePriceReached = limitReached;
    return limitReached;
  }

  get priceExceedsSpread(): boolean {
    if (this.isBuySide) {
      if (!this.asks[this.asks.length - 1]) return false;
      const bestAsk: FPNumber = this.asks[this.asks.length - 1][0];
      const price = new FPNumber(this.quoteValue);

      return FPNumber.gte(price, bestAsk);
    } else {
      if (!this.bids[0]) return false;
      const bestBid: FPNumber = this.bids[0][0];
      const price = new FPNumber(this.quoteValue);

      return FPNumber.lte(price, bestBid);
    }
  }

  get orderBookPrice(): string {
    const price = this.orderBookStats?.price ?? FPNumber.ZERO;
    const decimals = getBookDecimals(this.currentOrderBook);
    return price.dp(decimals).toLocaleString();
  }

  get orderBookPriceChange(): FPNumber {
    return this.orderBookStats?.priceChange ?? FPNumber.ZERO;
  }

  get orderBookVolume(): string {
    const volume = this.orderBookStats?.volume ?? FPNumber.ZERO;
    return volume.toLocaleString();
  }

  get marketOptionDisabled(): boolean {
    return this.orderBookStatus === OrderBookStatus.PlaceAndCancel;
  }

  get isZeroAmount(): boolean {
    return asZeroValue(this.baseValue);
  }

  get isZeroPrice(): boolean {
    return asZeroValue(this.quoteValue);
  }

  get hasZeroAmount(): boolean {
    return this.isZeroAmount || this.isZeroPrice;
  }

  get isPriceTooHigh(): boolean {
    if (!this.asks.length) return false;

    if (!this.isBuySide) {
      if (!this.asks[this.asks.length - 1]) return false;
      const bestAsk: FPNumber = this.asks[this.asks.length - 1][0];
      const fiftyPercentDelta = bestAsk.mul(new FPNumber(1.5));
      const price = new FPNumber(this.quoteValue);

      if (FPNumber.gt(price, fiftyPercentDelta)) return true;
    }

    return false;
  }

  get isPriceTooLow(): boolean {
    if (!this.bids.length) return false;

    if (this.isBuySide) {
      if (!this.bids[0]) return false;
      const bestBid: FPNumber = this.bids[0][0];
      const fiftyPercentDelta = bestBid.div(FPNumber.TWO);
      const price = new FPNumber(this.quoteValue);

      if (FPNumber.lt(price, fiftyPercentDelta)) return true;
    }

    return false;
  }

  get isPriceBeyondPrecision(): boolean {
    if (!this.currentOrderBook) return false;

    const tickSize = this.currentOrderBook.tickSize;
    const price = new FPNumber(this.quoteValue);

    return price.isZeroMod(tickSize);
  }

  get bookPrecision(): number {
    return this.currentOrderBook?.tickSize?.toLocaleString()?.split(FPNumber.DELIMITERS_CONFIG.decimal)[1].length ?? 2;
  }

  get amountPrecision(): number {
    return (
      this.currentOrderBook?.stepLotSize?.toLocaleString()?.split(FPNumber.DELIMITERS_CONFIG.decimal)[1].length ?? 2
    );
  }

  get isOutOfAmountBounds(): boolean {
    if (!this.currentOrderBook) return false;

    const { maxLotSize, minLotSize, stepLotSize } = this.currentOrderBook;
    const amountFP = new FPNumber(this.baseValue);

    return !(
      FPNumber.lte(amountFP, maxLotSize) &&
      FPNumber.gte(amountFP, minLotSize) &&
      amountFP.isZeroMod(stepLotSize)
    );
  }

  get computedBtnClass(): string {
    if (!this.isLoggedIn) return '';

    return this.isBuySide ? 'buy-btn' : '';
  }

  get isPriceInputDisabled(): boolean {
    return this.isMarketType;
  }

  get icon(): string {
    return this.visibleBookList ? 'arrows-circle-chevron-top-24' : 'arrows-circle-chevron-bottom-24';
  }

  get baseSymbol(): string {
    return this.baseAsset ? this.baseAsset.symbol : '';
  }

  get quoteSymbol(): string {
    return this.quoteAsset ? this.quoteAsset.symbol : '';
  }

  getTokenBalance(token: AccountAsset): CodecString {
    return getAssetBalance(token);
  }

  get areTokensSelected(): boolean {
    return !!(this.baseAsset && this.quoteAsset);
  }

  get limitTooltip(): string {
    return "A 'Limit' order lets you specify the exact price at which you want to buy or sell an asset. A 'Limit Buy' order will only be executed at the specified price or lower, while a 'Limit Sell' order will execute only at the specified price or higher. This control ensures you don't pay more or sell for less than you're comfortable with.";
  }

  get marketTooltip(): string {
    return "A 'Market Order' is an order to immediately buy or sell at the best available current price. It doesn't require setting a price, ensuring a fast execution but with the trade-off of less control over the price received or paid. This type of order is used when certainty of execution is a priority over price control.";
  }

  toggleBookList(): void {
    this.visibleBookList = !this.visibleBookList;
  }

  getPercent(value: string): number {
    if (!value) return 0;

    return new FPNumber(value).div(this.maxPossibleAmount).mul(FPNumber.HUNDRED).toNumber();
  }

  handleSlideInputChange(percent: string): void {
    this.setAmountSliderValue(Number(percent));

    const value = new FPNumber(percent).div(FPNumber.HUNDRED).mul(this.maxPossibleAmount).dp(this.amountPrecision);

    if (value) this.handleInputFieldBase(value.toString());
  }

  handleInputFieldQuote(preciseValue: string): void {
    const value = this.formatInputValue(preciseValue, this.bookPrecision);
    this.setQuoteValue(value);
    this.checkInputValidation();
  }

  handleInputFieldBase(preciseValue: string): void {
    const value = this.formatInputValue(preciseValue, this.amountPrecision);
    this.setBaseValue(value);
    this.setAmountSliderValue(this.getPercent(value));
    this.checkInputValidation();

    if (!value) {
      this.resetQuoteSubscription();
    }

    if (this.isMarketType) {
      value ? this.subscribeOnBookQuote() : this.setQuoteValue('');
    }
  }

  formatInputValue(value: string, precision: number): string {
    if (!value) return '';

    const [_, decimal] = value.split('.');

    return value.endsWith('.') || decimal?.length <= precision ? value : new FPNumber(value).dp(precision).toString();
  }

  get preparedForSwap(): boolean {
    return this.isLoggedIn && this.areTokensSelected;
  }

  get isInsufficientBalance(): boolean {
    if (!this.tokenFrom) return false;

    let fromValue!: string;

    if (this.isBuySide) {
      const quoteFP = new FPNumber(this.quoteValue);
      const baseFP = new FPNumber(this.baseValue);
      fromValue = quoteFP.mul(baseFP).toString();
    } else {
      fromValue = this.baseValue;
    }

    return this.preparedForSwap && hasInsufficientBalance(this.tokenFrom, fromValue, this.networkFee);
  }

  async placeLimitOrder(): Promise<void> {
    if (!this.isLoggedIn) {
      router.push({ name: PageNames.Wallet });
      return;
    }

    if (this.isMarketType) {
      this.subscribeOnBookQuote();
    }

    this.showPlaceOrderDialog();
  }

  get orderBookStatus(): OrderBookStatus {
    return this.currentOrderBook?.status ?? OrderBookStatus.Stop;
  }

  get bookStopped(): boolean {
    return ![OrderBookStatus.Trade, OrderBookStatus.PlaceAndCancel].includes(this.orderBookStatus);
  }

  get userReachedSpotLimit(): boolean {
    // TODO: [Rustem] Should be improved as user could put into existing price
    return (this.side === PriceVariant.Sell ? this.asks : this.bids).length >= MAX_ORDERS_PER_SIDE;
  }

  get userReachedOwnLimit(): boolean {
    return this.userLimitOrders?.length === MAX_ORDERS_PER_USER;
  }

  get isBuySide(): boolean {
    return this.side === PriceVariant.Buy;
  }

  private resetQuoteSubscription(): void {
    this.quoteSubscription?.unsubscribe();
    this.quoteSubscription = null;
  }

  private subscribeOnBookQuote(): void {
    if (!this.baseValue) return;
    this.resetQuoteSubscription();

    if (!this.areTokensSelected) return;

    const observableQuote = api.swap.subscribeOnResultRpc(
      (this.tokenFrom as AccountAsset).address,
      (this.tokenTo as AccountAsset).address,
      this.baseValue,
      this.isBuySide,
      LiquiditySourceTypes.OrderBook
    );

    this.quoteSubscription = observableQuote.subscribe(async (quoteData) => {
      const { amount } = await quoteData;

      if (FPNumber.fromCodecValue(amount).isZero() || this.limitOrderType === LimitOrderType.limit) {
        this.resetQuoteSubscription();
        this.setQuoteValue('');
        this.setToValue('');
        this.marketQuotePrice = '';
        return;
      }

      this.marketQuotePrice = FPNumber.fromCodecValue(amount)
        .div(FPNumber.fromNatural(this.baseValue))
        .dp(this.bookPrecision)
        .toString();

      this.prepareValuesForSwap(amount);
    });
  }

  prepareValuesForSwap(amount) {
    if (!this.areTokensSelected || asZeroValue(this.baseValue)) return;

    const fromValue = this.isBuySide ? this.getStringFromCodec(amount) : this.baseValue;
    const toValue = this.isBuySide ? this.baseValue : this.getStringFromCodec(amount);

    this.setFromValue(fromValue);
    this.setToValue(toValue);
    this.setQuoteValue(this.marketQuotePrice);
    this.setLiquiditySource(LiquiditySourceTypes.OrderBook);
    this.selectDexId(DexId.XOR); // make it changeable if other dexes are allowed
    this.checkInputValidation();
  }

  beforeDestroy(): void {
    this.resetQuoteSubscription();
    this.setTokenFromAddress(this.xor.address);
    this.setFromValue('');
    this.setTokenToAddress();
    this.setToValue('');
    this.setQuoteValue('');
    this.setBaseValue('');
    this.setLiquiditySource(LiquiditySourceTypes.Default);
    this.selectDexId(DexId.XOR);
    this.limitOrderType = LimitOrderType.limit;
  }

  resetValues() {
    this.setBaseValue('');
    this.setQuoteValue('');
    this.limitOrderType = LimitOrderType.limit;
  }

  showPlaceOrderDialog(): void {
    this.confirmPlaceOrderVisibility = true;
  }

  get maxPossibleAmount(): FPNumber {
    if (!this.currentOrderBook) return FPNumber.ZERO;
    const max = getMaxValue(this.baseAsset, this.networkFee);
    const maxLotSize: FPNumber = this.currentOrderBook.maxLotSize;

    const maxPossible = FPNumber.fromNatural(max, this.bookPrecision);

    return FPNumber.lte(maxPossible, maxLotSize) ? maxPossible : maxLotSize;
  }

  handleMaxValue(): void {
    this.handleInputFieldBase(this.maxPossibleAmount.toString());
    this.checkInputValidation();
  }

  get isMaxAmountAvailable(): boolean {
    if (!(this.baseAsset && this.quoteAsset)) return false;

    return this.isLoggedIn && isMaxButtonAvailable(this.baseAsset, this.baseValue, this.networkFee, this.xor, true);
  }

  handleTabClick(): void {
    this.setTokens();

    if (!this.isMarketType) {
      this.resetQuoteSubscription();
    }

    if (this.isMarketType) {
      this.setQuoteValue('');
      if (this.baseValue) this.subscribeOnBookQuote();
    }

    this.checkInputValidation();
  }
}
</script>

<style lang="scss">
.book-validation {
  // override popover styles
  &__popover {
    width: 450px;
    background-color: var(--s-color-utility-body);
    border-radius: $basic-spacing;
    color: var(--s-color-base-content-primary);
    border: none;
    padding: 0 !important;
    word-break: normal !important;
    font-size: var(--s-font-size-small);
  }

  &__disclaimer {
    width: 100%;
    background-color: var(--s-color-base-background);
    border-radius: var(--s-border-radius-small);
    box-shadow: var(--s-shadow-dialog);
    padding: 20px $basic-spacing;
    position: relative;
    &-header {
      font-weight: 500;
      margin-bottom: 10px;
      width: 75%;
      text-align: left;
    }
    &-paragraph {
      color: var(--s-color-base-content-secondary);
      width: 75%;
      text-align: left;
    }
    &-warning.icon {
      position: absolute;
      background-color: #479aef;
      border: 2.25257px solid #f7f3f4;
      box-shadow: var(--s-shadow-element-pressed);
      top: 20px;
      right: 20px;
      border-radius: 50%;
      color: #fff;
      width: 46px;
      height: 46px;
      .s-icon-notifications-alert-triangle-24 {
        display: block;
        color: #fff;
        margin-top: 5px;
        margin-left: 7px;
      }
    }
  }
}

.order-book {
  @include custom-tabs;

  &__tab {
    margin-bottom: #{$basic-spacing-medium};
  }

  .s-tabs.s-rounded .el-tabs__nav-wrap .el-tabs__item {
    &:not(.is-active).is-disabled {
      color: var(--s-color-base-content-secondary);
    }
    &.is-disabled {
      cursor: not-allowed;
    }
  }

  &-input {
    margin-bottom: $inner-spacing-mini;

    // overwrite select-button styles
    button.el-button.neumorphic.s-tertiary:focus:not(:active) {
      outline: none;
    }

    button.el-button.el-button--select-token.token-select-button--token {
      &:hover,
      &:focus {
        box-shadow: var(--neu-button-tertiary-box-shadow);
        cursor: initial;
        outline: none;
      }
    }
  }

  .btn {
    width: 100%;
  }

  .buy-btn {
    width: 100%;
    background-color: #34ad87 !important;
  }

  .buy-btn.is-disabled {
    background-color: unset !important;
  }
}

.order-book-whitelist.el-popover {
  border-radius: var(--s-border-radius-small);
  padding: 0;
}

.set-widget {
  .el-loading-mask {
    border-radius: 20px;
  }
}

.order-book-choose-pair {
  width: 100%;
  background: var(--base-day-background, #f4f0f1);
  border-radius: var(--s-border-radius-small);
  margin-bottom: $inner-spacing-mini;
  padding: 10px $basic-spacing;

  &:hover {
    cursor: pointer;
  }
}

[design-system-theme='dark'] {
  .order-book-choose-pair {
    background: var(--s-color-base-background);
  }
}
</style>

<style lang="scss" scoped>
.order-book {
  padding: 4px $basic-spacing var(--s-size-small);

  &-choose-btn {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;

    &-icon {
      color: var(--s-color-base-content-secondary);
      filter: drop-shadow(1px 1px 5px rgba(0, 0, 0, 0.01)) drop-shadow(-1px -1px 5px rgba(0, 0, 0, 0.01));

      &:hover {
        cursor: pointer;
      }
    }
  }

  &-pair-name {
    display: flex;
    align-items: center;
    font-size: 20px;
    font-weight: 700;
  }

  &-pair-data {
    display: flex;
    color: var(--s-color-base-content-secondary);

    &-item {
      display: flex;
      flex-direction: column;
      margin-right: 42px;

      &__value {
        font-size: var(--s-font-size-small);
      }
    }
  }

  &-fiat {
    color: var(--s-color-fiat-value);
    line-height: var(--s-line-height-medium);
    letter-spacing: var(--s-letter-spacing-small);
  }

  .order-book {
    &-total {
      display: flex;
      justify-content: space-between;
      margin: 12px 0 $basic-spacing 0;

      &-value {
        &-amount {
          font-weight: 700;
          margin-right: 6px;
        }
        &-fiat {
          color: var(--s-color-fiat-value);
          font-family: var(--s-font-family-default);
          font-weight: 400;
          line-height: var(--s-line-height-medium);
          letter-spacing: var(--s-letter-spacing-small);

          .dollar-sign {
            opacity: 0.6;
            margin-right: 2px;
          }
        }
      }
    }
  }

  .book-inform-icon-btn {
    margin-left: $inner-spacing-mini;
  }

  .delimiter {
    background: var(--s-color-base-border-secondary);
    margin: $inner-spacing-mini 0;
    height: 1px;
    width: 100%;
  }
}

.s-tabs.order-book__tab.el-tabs {
  i.s-icon-info-16 {
    margin-left: 6px;
  }
}
</style>
