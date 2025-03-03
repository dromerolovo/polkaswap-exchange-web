import { BridgeNetworkType } from '@sora-substrate/util/build/bridgeProxy/consts';
import { defineMutations } from 'direct-vuex';

import ethersUtil from '@/utils/ethers-util';
import type { Provider } from '@/utils/ethers-util';

import type { Web3State, EthBridgeSettings, SubNetworkApps } from './types';
import type { EvmNetwork } from '@sora-substrate/util/build/bridgeProxy/evm/types';
import type { SupportedApps, BridgeNetworkId } from '@sora-substrate/util/build/bridgeProxy/types';

const mutations = defineMutations<Web3State>()({
  setEvmAddress(state, address: string): void {
    const formatted = address.toLowerCase();
    state.evmAddress = formatted;
    ethersUtil.storeEvmUserAddress(formatted);
  },
  resetEvmAddress(state): void {
    state.evmAddress = '';
    ethersUtil.removeEvmUserAddress();
  },

  setSubAddress(state, { address, name }: { address: string; name: string }): void {
    state.subAddress = address;
    state.subAddressName = name;
  },

  setSubSS58(state, prefix: number) {
    state.subSS58 = prefix;
  },

  setEvmNetworksApp(state, networksIds: EvmNetwork[]): void {
    state.evmNetworkApps = Object.freeze([...networksIds]);
  },
  setSubNetworkApps(state, apps: SubNetworkApps): void {
    state.subNetworkApps = Object.freeze({ ...apps });
  },
  setSupportedApps(state, supportedApps: SupportedApps): void {
    state.supportedApps = Object.freeze({ ...supportedApps });
  },
  setEvmProvider(state, provider: Provider): void {
    state.evmProvider = provider;
  },
  resetEvmProvider(state): void {
    state.evmProvider = null;
  },
  setEvmProviderLoading(state, provider: Nullable<Provider> = null): void {
    state.evmProviderLoading = provider;
  },
  // by provider
  setProvidedEvmNetwork(state, networkId: BridgeNetworkId | null): void {
    state.evmProviderNetwork = networkId;
  },
  resetEvmProviderNetwork(state): void {
    state.evmProviderNetwork = null;
  },
  setEvmProviderSubscription(state, subscription: FnWithoutArgs): void {
    state.evmProviderSubscription = subscription;
  },
  resetEvmProviderSubscription(state): void {
    state.evmProviderSubscription?.();
    state.evmProviderSubscription = null;
  },
  // by user
  setSelectedNetwork(state, networkId: BridgeNetworkId): void {
    state.networkSelected = networkId;
    ethersUtil.storeSelectedNetwork(networkId);
  },

  setNetworkType(state, networkType: BridgeNetworkType) {
    state.networkType = networkType;
    ethersUtil.storeSelectedBridgeType(networkType);
  },

  setSelectNetworkDialogVisibility(state, flag: boolean): void {
    state.selectNetworkDialogVisibility = flag;
  },

  setSelectAccountDialogVisibility(state, flag: boolean): void {
    state.selectAccountDialogVisibility = flag;
  },

  setSelectProviderDialogVisibility(state, flag: boolean): void {
    state.selectProviderDialogVisibility = flag;
  },

  // for hashi bridge
  setEthBridgeSettings(state, { evmNetwork, address }: EthBridgeSettings): void {
    state.ethBridgeEvmNetwork = evmNetwork;
    state.ethBridgeContractAddress = Object.freeze({
      XOR: address.XOR,
      VAL: address.VAL,
      OTHER: address.OTHER,
    });
  },
});

export default mutations;
