import { FPNumber } from '@sora-substrate/math';
import { Component, Vue } from 'vue-property-decorator';

import { state } from '@/store/decorators';

import type { ValidatorInfoFull } from '@sora-substrate/util/build/staking/types';

@Component
export default class ValidatorsMixin extends Vue {
  @state.staking.historyDepth historyDepth!: Nullable<number>;

  decodeName(validator: ValidatorInfoFull) {
    const identityName = validator.identity?.info.display;
    return identityName
      ? identityName.startsWith('0x')
        ? Buffer.from(identityName.slice(2), 'hex').toString('utf8')
        : identityName
      : validator.address;
  }

  formatName(validator: ValidatorInfoFull, maxLength = 20) {
    const name = this.decodeName(validator);
    return name.length > maxLength ? name.slice(0, maxLength) + '...' : name;
  }

  formatCommission(commission: string) {
    return FPNumber.fromCodecValue(commission, 7).toString();
  }
}
