<template>
  <div class="validators">
    <div v-if="!isValidatorModeRecommended" class="search-container">
      <s-input
        type="text"
        v-model="search"
        :placeholder="t('soraStaking.validatorsList.search')"
        prefix="s-icon-basic-search-24"
      >
        <template #right>
          <s-button class="filters-button" type="outline" size="mini" @click="openFilters">
            <div class="filters-button-content">
              <span>{{ t('soraStaking.validatorsFilterDialog.title') }}</span>
              <s-icon name="basic-settings-24" size="14px" />
            </div>
          </s-button>
        </template>
      </s-input>
    </div>
    <div class="table-header">
      <div class="table-header-avatar table-header-item">
        <s-icon name="various-bone-24" size="14px" />
      </div>
      <div class="table-header-name table-header-item">{{ t('soraStaking.validatorsList.name') }}</div>
      <div class="table-header-commission table-header-item">
        <span>{{ t('soraStaking.validatorsList.commission') }}</span>
        <s-tooltip border-radius="mini" :content="t('soraStaking.validatorsList.commissionTooltip')">
          <s-icon name="info-16" size="14px" />
        </s-tooltip>
      </div>
    </div>
    <div class="list">
      <s-scrollbar class="validators-list-scrollbar">
        <ul class="list">
          <li v-for="validator in filteredValidators" :key="validator.address" class="validator">
            <validator-avatar class="avatar" :validator="validator">
              <div v-if="isSelected(validator)" class="check" slot="icon">
                <s-icon name="basic-check-mark-24" size="12px" />
              </div>
            </validator-avatar>
            <div class="name">
              {{ formatName(validator) }}
            </div>
            <div class="commission">
              <span>{{ formatCommission(validator.commission) }}%</span>
            </div>
            <div
              v-if="mode === ValidatorsListMode.SELECT"
              class="select-area"
              @click="toggleSelectValidator(validator)"
            />
          </li>
        </ul>
      </s-scrollbar>

      <div v-if="!filteredValidators.length" class="empty">
        {{ emptyText }}
      </div>
    </div>
    <div class="blackout" />
  </div>
</template>

<script lang="ts">
import { components, mixins } from '@soramitsu/soraneo-wallet-web';
import { Component, Mixins, Prop, Watch } from 'vue-property-decorator';

import { Components } from '@/consts';
import { lazyComponent } from '@/router';

import { soraStakingLazyComponent } from '../../router';
import {
  emptyValidatorsFilter,
  recommendedValidatorsFilter,
  SoraStakingComponents,
  ValidatorsListMode,
} from '../consts';
import StakingMixin from '../mixins/StakingMixin';
import ValidatorsMixin from '../mixins/ValidatorsMixin';
import { ValidatorsFilter } from '../types';

import type { ValidatorInfoFull } from '@sora-substrate/util/build/staking/types';

@Component({
  components: {
    TokenInput: lazyComponent(Components.TokenInput),
    InfoLine: components.InfoLine,
    StakingHeader: soraStakingLazyComponent(SoraStakingComponents.StakingHeader),
    ValidatorAvatar: soraStakingLazyComponent(SoraStakingComponents.ValidatorAvatar),
  },
})
export default class ValidatorsList extends Mixins(StakingMixin, ValidatorsMixin, mixins.LoadingMixin) {
  @Prop({ required: true, type: String }) readonly mode!: ValidatorsListMode;

  ValidatorsListMode = ValidatorsListMode;

  search = '';

  get isValidatorModeRecommended() {
    return this.mode === ValidatorsListMode.RECOMMENDED;
  }

  get filteredValidators() {
    const filtered = this.filterValidators(this.validators, this.validatorsFilter, this.search);
    switch (this.mode) {
      case ValidatorsListMode.RECOMMENDED:
        return this.filterValidators(this.validators, recommendedValidatorsFilter, '').slice(0, this.maxNominations);
      case ValidatorsListMode.USER:
        return filtered.filter((v) => this.stakingInfo?.myValidators.includes(v.address));
      default:
        return filtered;
    }
  }

  get emptyText() {
    if (this.mode === ValidatorsListMode.USER && this.stakingInfo?.myValidators.length === 0) {
      return this.t('soraStaking.validatorsList.noNominatedValidators');
    }
    return this.t('soraStaking.validatorsList.noValidators');
  }

  filterValidators(validators: ValidatorInfoFull[], filter: ValidatorsFilter, search = '') {
    return validators.filter((validator) => {
      if (filter.hasIdentity && (!validator.identity || !Object.keys(validator.identity.info).length)) {
        return false;
      }
      if (filter.notSlashed && validator.blocked) {
        return false;
      }
      if (filter.notOversubscribed && validator.isOversubscribed) {
        return false;
      }
      if (filter.twoValidatorsPerIdentity && validator.isOversubscribed) {
        const validatorsWithSameIdentity = validators.filter(
          (v) => v.identity?.info.display === validator.identity?.info.display
        );
        if (validatorsWithSameIdentity.length > 2) {
          return false;
        }
      }
      const name = this.decodeName(validator);
      return name.toLowerCase().includes(search.toLowerCase());
    });
  }

  toggleSelectValidator(validator: ValidatorInfoFull) {
    if (this.isValidatorModeRecommended) {
      return;
    }
    const index = this.selectedValidators.findIndex((v) => v.address === validator.address);
    const selected = [...this.selectedValidators];
    if (index > -1) {
      selected.splice(index, 1);
    } else {
      selected.push(validator);
    }
    this.$emit('update:selected', selected);
  }

  isSelected(validator: ValidatorInfoFull) {
    return this.selectedValidators.some((v) => v.address === validator.address);
  }

  getValidatorAvatar(validator: ValidatorInfoFull) {
    return validator.identity?.info.image ? validator.identity?.info.image : '/staking/validator-avatar.svg';
  }

  @Watch('validators', { immediate: true })
  onValidatorsChange() {
    this.$emit('update:selected', this.isValidatorModeRecommended ? this.filteredValidators : []);
  }

  openFilters() {
    this.setShowValidatorsFilterDialog(true);
  }

  created() {
    this.setValidatorsFilter(emptyValidatorsFilter);
  }
}
</script>

<style lang="scss">
.validators-list-scrollbar {
  .el-scrollbar__wrap {
    overflow-x: hidden;
  }
  .el-scrollbar__bar.is-horizontal {
    display: none;
  }
}
</style>

<style lang="scss" scoped>
.validators {
  position: relative;
}

.search-container {
  position: relative;
  display: flex;
  align-items: center;
  margin-top: 16px;
}

.filters-button {
  margin-left: 8px;
  border-radius: 8px;
  background: var(--s-color-base-on-accent);

  &:not(:hover) {
    border-color: var(--s-color-base-border-secondary);
  }

  &-content {
    display: flex;
    gap: 6px;
    color: var(--s-color-base-content-primary);

    span {
      font-weight: 400;
      letter-spacing: -0.24px;
    }

    i {
      color: var(--s-color-base-content-tertiary);
    }
  }
}

.blackout {
  position: absolute;
  width: 100%;
  height: 132px;
  bottom: 0;
  left: 0;
  pointer-events: none;
  background: linear-gradient(180deg, transparent 0%, var(--s-color-utility-surface) 100%);
}

.table-header {
  display: flex;
  align-content: center;
  height: 36px;
  margin-top: 16px;
  border-bottom: 1px solid var(--s-color-base-border-secondary);

  &-item {
    display: flex;
    align-items: center;
    color: var(--s-color-brand-day);

    font-size: 14px;
    font-style: normal;
    font-weight: 800;
    line-height: normal;
    letter-spacing: -0.28px;
  }
  &-avatar {
    display: flex;
    justify-content: center;
    width: 38px;

    i {
      color: var(--s-color-base-content-tertiary);
    }
  }
  &-name {
    flex: 1;
    margin-left: 8px;
  }
  &-commission {
    width: 120px;

    span {
      margin-right: 8px;
    }
  }
}

.validators-list-scrollbar {
  @include scrollbar;
  height: 380px !important;
  margin: 0 -24px !important;

  ul {
    list-style-type: none;
    padding: 0 24px;
    padding-bottom: 64px;

    li {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 100%;
      padding: 10px 0;
      border-bottom: 1px solid var(--s-color-base-border-secondary);
    }
  }
}

.avatar,
.name {
  height: 100%;
}

.avatar {
  margin-right: 10px;

  .check {
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    background-color: var(--s-color-theme-accent);

    i {
      color: var(--s-color-base-on-accent);
    }
  }
}

.name {
  flex: 1;
  font-weight: bold;
  margin-right: 10px;
}

.commission {
  color: var(--s-color-status-info);
  text-align: right;
  font-size: 16px;
  font-style: normal;
  font-weight: 600;
  line-height: 150%;
  letter-spacing: -0.32px;

  span {
    margin-right: 8px;
  }
}

.select-area {
  position: absolute;
  top: 0;
  left: 0;
  width: calc(100% - 20px);
  height: 100%;
  cursor: pointer;
}

.empty {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  color: var(--s-color-brand-day);
  font-size: 16px;
}
</style>
