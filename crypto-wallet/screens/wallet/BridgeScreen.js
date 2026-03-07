/**
 * BridgeScreen.js
 *
 * Three-tab screen for ZetaChain cross-chain operations:
 *
 *  DEPOSIT  — Move tokens FROM an external EVM chain INTO ZetaChain (as ZRC-20).
 *             Uses txType="evm_deposit" → sendFromEVM() → @zetachain/toolkit evmDeposit.
 *             Signer is connected to the SOURCE chain provider, not ZetaChain.
 *
 *  WITHDRAW — Move ZRC-20 tokens FROM ZetaChain BACK to their home chain.
 *             Uses txType="withdraw_from_zeta" → withdrawFromZeta() → zetachainWithdraw.
 *             Token list comes directly from zrc20Balances in ZetaWalletContext.
 *             Destination chain is derived from the token's foreignChainId.
 *
 *  HISTORY  — Live CCTX tracker. Reads txHistory from useZetaTransactionManager.
 *             Each entry shows the multi-step lifecycle (PendingInbound →
 *             PendingOutbound → OutboundMined) with hashes and an explorer link.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPOSIT FLOW — SOURCE CHAIN PROVIDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Unlike ZetaChain-native txs, evm_deposit transactions must be submitted on
 * the SOURCE chain (Ethereum, BNB, etc.). This screen creates a temporary
 * ethers.JsonRpcProvider for the selected source chain and passes it to
 * TransactionModal via the sourceChainProvider prop. TransactionModal then
 * reconnects the decrypted signer to that provider (see TransactionModal.js).
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Linking,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ethers } from "ethers";
import {
  useWallet,
  ACTIVE_ZETA_NETWORK,
} from "../../contexts/WalletContext";
import { useZetaTransactionManager } from "../../hooks/useTransactionManager";
import { useTheme } from "../../contexts/ThemeContext";
import { TransactionModal } from "../../components/TransactionModal";
import { validateAddress, validateAmount } from "../../utils/Validators";
import { formatAddress } from "../../utils/Wallet";
import Alert from "../../utils/Alert";
import { SPACING, FONTS } from "../../constants/Theme";
import { getBridgeableChains } from "../../constants/Chain";

// ─── Connected chain configs ──────────────────────────────────────────────────
// Sourced from constants/Chain.js — add chains there, not here.
// getBridgeableChains() returns all mainnet SUPPORTED_CHAINS except ZetaChain.
// Chain shape from Chain.js: { id, name, symbol, rpcUrl, explorer, icon, color }
// We normalize to the shape BridgeScreen expects internally.
const CONNECTED_CHAINS = getBridgeableChains().map((chain) => ({
  id: String(chain.id),
  name: chain.name,
  symbol: chain.symbol,
  color: chain.color,
  rpc: chain.rpcUrl, // Chain.js uses rpcUrl; BridgeScreen uses rpc
  explorerUrl: chain.explorer, // Chain.js uses explorer; BridgeScreen uses explorerUrl
  icon: chain.icon,
}));

// ─── CCTX status UI config ────────────────────────────────────────────────────
const STATUS_UI = {
  PendingInbound: {
    label: "Confirming",
    color: "#F59E0B",
    icon: "time-outline",
  },
  PendingOutbound: { label: "Signing", color: "#6366F1", icon: "key-outline" },
  OutboundMined: {
    label: "Delivered",
    color: "#10B981",
    icon: "checkmark-circle",
  },
  PendingRevert: {
    label: "Reverting",
    color: "#F59E0B",
    icon: "refresh-outline",
  },
  Reverted: { label: "Reverted", color: "#EF4444", icon: "alert-circle" },
  Aborted: { label: "Aborted", color: "#EF4444", icon: "close-circle" },
};

const finalStatuses = {
  confirmed: { label: "Delivered", color: "#10B981" },
  failed: { label: "Failed", color: "#EF4444" },
  pending: { label: "In Progress", color: "#F59E0B" },
};

const ZETA_EXPLORER =
  ACTIVE_ZETA_NETWORK.explorerUrl ?? "https://explorer.zetachain.com";

const chainName = (id) =>
  CONNECTED_CHAINS.find((c) => c.id === String(id))?.name ?? `Chain ${id}`;

const extractBase = (sym = "") => sym.split(".")[0].toUpperCase();

const AVATAR_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
];
const symbolColor = (s = "") => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

// ─── Component ────────────────────────────────────────────────────────────────

const BridgeScreen = ({ navigation }) => {
  const theme = useTheme();
  const S = createStyles(theme);

  const { address, nativeZetaBalance, zrc20Balances, refreshZRC20Balances } =
    useWallet();

  const { txHistory, cctxExplorerUrl } = useZetaTransactionManager();

  const [activeTab, setActiveTab] = useState("deposit");

  // ── Deposit state ──────────────────────────────────────────────────────────
  const [depositChain, setDepositChain] = useState(CONNECTED_CHAINS[0]);
  const [depositToken, setDepositToken] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositReceiver, setDepositReceiver] = useState("");
  const [depositSelf, setDepositSelf] = useState(true); // true = receive on own address
  const [depositErrors, setDepositErrors] = useState({});
  const [sourceProvider, setSourceProvider] = useState(null);
  const [showChainPicker, setShowChainPicker] = useState(false);

  // ── Withdraw state ─────────────────────────────────────────────────────────
  const [withdrawToken, setWithdrawToken] = useState(null);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawReceiver, setWithdrawReceiver] = useState("");
  const [withdrawSelf, setWithdrawSelf] = useState(true); // true = send to own address
  const [withdrawErrors, setWithdrawErrors] = useState({});
  const [showTokenPicker, setShowTokenPicker] = useState(false);

  // ── TransactionModal ───────────────────────────────────────────────────────
  const [txModalVisible, setTxModalVisible] = useState(false);
  const [txModalProps, setTxModalProps] = useState({});

  // ── ZRC-20 token list for withdraw tab ────────────────────────────────────
  const withdrawableTokens = useMemo(() => {
    const tokens = [];
    zrc20Balances
      .filter((item) => parseFloat(item.formatted) > 0)
      .forEach((item) => {
        tokens.push({
          id: item.token.zrc20Address,
          symbol: item.token.symbol,
          name: item.token.name,
          balance: item.formatted,
          decimals: item.token.decimals,
          zrc20Address: item.token.zrc20Address,
          foreignChainId: item.token.foreignChainId,
          destinationChain: chainName(item.token.foreignChainId),
        });
      });
    return tokens;
  }, [zrc20Balances]);

  // ── Deposit: chain selection ───────────────────────────────────────────────
  const handleSelectChain = (chain) => {
    setDepositChain(chain);
    try {
      const prov = new ethers.JsonRpcProvider(chain.rpc, {
        chainId: parseInt(chain.id),
        name: chain.name,
      });
      setSourceProvider(prov);
    } catch (e) {
      console.warn("[Bridge] Provider creation failed:", e.message);
    }
    setDepositToken("");
    setDepositReceiver("");
    setDepositSelf(true);
    setDepositErrors({});
    setShowChainPicker(false);
  };

  // Create provider when screen loads / depositChain changes
  React.useEffect(() => {
    handleSelectChain(depositChain);
  }, []);

  // ── Deposit: validation + submit ───────────────────────────────────────────
  const handleDepositContinue = () => {
    const errs = {};

    if (depositToken && !ethers.isAddress(depositToken)) {
      errs.token = "Invalid ERC-20 contract address";
    }

    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      errs.amount = "Enter an amount";
    }

    // If sending to another address, validate it; otherwise own address is used
    const receiver = depositSelf ? address : depositReceiver.trim();
    if (!depositSelf && !validateAddress(receiver).isValid) {
      errs.receiver = "Invalid ZetaChain address";
    }

    if (Object.keys(errs).length > 0) {
      setDepositErrors(errs);
      return;
    }
    setDepositErrors({});

    setTxModalProps({
      txType: "evm_deposit",
      amount: depositAmount,
      receiver,
      tokenSymbol: depositToken ? "ERC-20" : depositChain.symbol,
      token: depositToken.trim() || undefined,
      sourceChainId: depositChain.id,
      sourceChainProvider: sourceProvider,
      title: `Deposit to ZetaChain`,
      description: `Moving ${depositAmount} ${depositToken ? "tokens" : depositChain.symbol} from ${depositChain.name} to ZetaChain`,
    });
    setTxModalVisible(true);
  };

  // ── Withdraw: validation + submit ─────────────────────────────────────────
  const handleWithdrawContinue = () => {
    const errs = {};

    if (!withdrawToken) {
      errs.token = "Select a token to withdraw";
    }

    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      errs.amount = "Enter an amount";
    } else if (
      withdrawToken &&
      parseFloat(withdrawAmount) > parseFloat(withdrawToken.balance)
    ) {
      errs.amount = "Exceeds available balance";
    }

    // If sending to another address, validate it; otherwise own address is used
    const receiver = withdrawSelf ? address : withdrawReceiver.trim();
    if (!withdrawSelf && !validateAddress(receiver).isValid) {
      errs.receiver = `Invalid ${withdrawToken?.destinationChain ?? "destination"} address`;
    }

    if (Object.keys(errs).length > 0) {
      setWithdrawErrors(errs);
      return;
    }
    setWithdrawErrors({});

    setTxModalProps({
      txType: "withdraw_from_zeta",
      amount: withdrawAmount,
      receiver,
      tokenSymbol: withdrawToken.symbol,
      zrc20Address: withdrawToken.zrc20Address,
      destinationChainId: withdrawToken.foreignChainId,
      title: `Withdraw ${withdrawToken.symbol}`,
      description: `Sending ${withdrawAmount} ${withdrawToken.symbol} to ${withdrawToken.destinationChain} (${formatAddress(receiver, 8)})`,
    });
    setTxModalVisible(true);
  };

  const handleTxSuccess = async (record) => {
    await refreshZRC20Balances();
    setTxModalVisible(false);
    if (activeTab === "deposit") {
      setDepositAmount("");
      setDepositToken("");
      setDepositReceiver("");
    } else {
      setWithdrawAmount("");
      setWithdrawReceiver("");
      setWithdrawToken(null);
    }
    setActiveTab("history");
    Alert.alert(
      "Transaction submitted",
      "Track its progress in the History tab.",
    );
  };

  const handleTxError = (err) => {
    if (err?.type !== "cancelled") {
      Alert.alert(err?.title ?? "Failed", err?.message ?? "Transaction error");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={S.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Header ── */}
      <View style={S.header}>
        <Text style={S.headerTitle}>Bridge</Text>
        <View style={S.networkBadge}>
          <View style={S.networkDot} />
          <Text style={S.networkBadgeText}>ZetaChain</Text>
        </View>
      </View>

      {/* ── Tabs ── */}
      <View style={S.tabs}>
        {[
          {
            id: "deposit",
            label: "Deposit",
            icon: "arrow-down-circle-outline",
          },
          {
            id: "withdraw",
            label: "Withdraw",
            icon: "arrow-up-circle-outline",
          },
          {
            id: "history",
            label: "History",
            icon: "time-outline",
            badge: txHistory.filter((t) => t.finalStatus === "pending").length,
          },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[S.tab, activeTab === tab.id && S.tabActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon}
              size={18}
              color={
                activeTab === tab.id
                  ? theme.COLORS.primary
                  : theme.COLORS.textSecondary
              }
            />
            <Text
              style={[S.tabLabel, activeTab === tab.id && S.tabLabelActive]}
            >
              {tab.label}
            </Text>
            {!!tab.badge && tab.badge > 0 && (
              <View style={S.tabBadge}>
                <Text style={S.tabBadgeText}>{tab.badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={S.scroll}
        contentContainerStyle={S.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ══════════════════════════════════════════════════════════════════
            DEPOSIT TAB
            Move tokens FROM an external EVM chain INTO ZetaChain as ZRC-20.
            The user picks the source chain, optionally enters an ERC-20
            contract address (blank = native token), amount, and receiver.
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "deposit" && (
          <>
            <FlowDiagram
              theme={theme}
              leftLabel={depositChain.name}
              leftColor={depositChain.color}
              rightLabel="ZetaChain"
              rightColor={theme.COLORS.primary}
              label="Deposit"
            />

            {/* Source chain picker */}
            <FieldLabel theme={theme} label="Source Chain" />
            <TouchableOpacity
              style={S.selector}
              onPress={() => setShowChainPicker(true)}
              activeOpacity={0.7}
            >
              {depositChain.icon ? (
                <Image
                  source={{ uri: depositChain.icon }}
                  style={S.selectorChainIcon}
                />
              ) : (
                <View
                  style={[S.chainDot, { backgroundColor: depositChain.color }]}
                />
              )}
              <Text style={S.selectorText}>{depositChain.name}</Text>
              <Text style={S.selectorSub}>{depositChain.symbol}</Text>
              <Ionicons
                name="chevron-down"
                size={18}
                color={theme.COLORS.textSecondary}
              />
            </TouchableOpacity>

            {/* Token address (optional — blank = native) */}
            <FieldLabel
              theme={theme}
              label="Token Contract Address"
              hint="Leave blank to deposit the native token"
            />
            <BridgeInput
              theme={theme}
              value={depositToken}
              onChangeText={(t) => {
                setDepositToken(t);
                if (depositErrors.token)
                  setDepositErrors((p) => ({ ...p, token: null }));
              }}
              placeholder={`ERC-20 address on ${depositChain.name} (optional)`}
              error={depositErrors.token}
              autoCapitalize="none"
            />

            {/* Amount */}
            <FieldLabel theme={theme} label="Amount" />
            <BridgeInput
              theme={theme}
              value={depositAmount}
              onChangeText={(t) => {
                setDepositAmount(t.replace(/[^0-9.]/g, ""));
                if (depositErrors.amount)
                  setDepositErrors((p) => ({ ...p, amount: null }));
              }}
              placeholder="0.0"
              keyboardType="decimal-pad"
              error={depositErrors.amount}
              right={
                <Text style={S.inputSuffix}>
                  {depositToken ? "TOKEN" : depositChain.symbol}
                </Text>
              }
            />

            {/* Receiver toggle */}
            <FieldLabel theme={theme} label="Receive On ZetaChain" />
            <SelfToggle
              theme={theme}
              isSelf={depositSelf}
              onToggle={(val) => {
                setDepositSelf(val);
                setDepositReceiver("");
                setDepositErrors((p) => ({ ...p, receiver: null }));
              }}
              selfLabel="My ZetaChain address"
              otherLabel="Another address"
            />
            {!depositSelf && (
              <BridgeInput
                theme={theme}
                value={depositReceiver}
                onChangeText={(t) => {
                  setDepositReceiver(t);
                  if (depositErrors.receiver)
                    setDepositErrors((p) => ({ ...p, receiver: null }));
                }}
                placeholder="ZetaChain address (0x…)"
                error={depositErrors.receiver}
                autoCapitalize="none"
              />
            )}
            {depositSelf && (
              <View style={S.selfAddressDisplay}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color={theme.COLORS.primary}
                />
                <Text
                  style={S.selfAddressText}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {address}
                </Text>
              </View>
            )}

            <InfoCard
              theme={theme}
              icon="information-circle-outline"
              text={`Tokens will arrive on ZetaChain as ZRC-20 in ~1–3 minutes. Gas fees on ${depositChain.name} apply.`}
            />

            <BridgeButton
              theme={theme}
              label="Continue →"
              onPress={handleDepositContinue}
            />
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            WITHDRAW TAB
            Move ZRC-20 tokens FROM ZetaChain BACK to their home chain.
            Token list is loaded from zrc20Balances in ZetaWalletContext.
            Destination chain is derived from the token's foreignChainId.
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "withdraw" && (
          <>
            <FlowDiagram
              theme={theme}
              leftLabel="ZetaChain"
              leftColor={theme.COLORS.primary}
              rightLabel={withdrawToken?.destinationChain ?? "Destination"}
              rightColor={
                withdrawToken
                  ? symbolColor(withdrawToken.symbol)
                  : theme.COLORS.textSecondary
              }
              label="Withdraw"
            />

            {/* ZRC-20 token picker */}
            <FieldLabel theme={theme} label="Token to Withdraw" />
            <TouchableOpacity
              style={S.selector}
              onPress={() => setShowTokenPicker(true)}
              activeOpacity={0.7}
            >
              {withdrawToken ? (
                <>
                  <View
                    style={[
                      S.tokenAvatar,
                      { backgroundColor: symbolColor(withdrawToken.symbol) },
                    ]}
                  >
                    <Text style={S.tokenAvatarText}>
                      {extractBase(withdrawToken.symbol).substring(0, 2)}
                    </Text>
                  </View>
                  <View style={S.selectorTokenInfo}>
                    <Text style={S.selectorText}>{withdrawToken.symbol}</Text>
                    <Text style={S.selectorSub}>
                      {parseFloat(withdrawToken.balance).toFixed(6)} available
                    </Text>
                  </View>
                  <View style={S.destinationPill}>
                    <Text style={S.destinationPillText}>
                      → {withdrawToken.destinationChain}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={theme.COLORS.textSecondary}
                  />
                </>
              ) : (
                <>
                  <Ionicons
                    name="layers-outline"
                    size={20}
                    color={theme.COLORS.textSecondary}
                  />
                  <Text
                    style={[
                      S.selectorText,
                      { color: theme.COLORS.textSecondary, marginLeft: 8 },
                    ]}
                  >
                    Select ZRC-20 token
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={theme.COLORS.textSecondary}
                    style={{ marginLeft: "auto" }}
                  />
                </>
              )}
            </TouchableOpacity>
            {withdrawErrors.token && (
              <Text style={S.errorText}>{withdrawErrors.token}</Text>
            )}

            {/* Destination chain banner */}
            {withdrawToken && (
              <View style={S.destinationCard}>
                <Ionicons
                  name="arrow-forward-circle-outline"
                  size={18}
                  color={theme.COLORS.primary}
                />
                <Text style={S.destinationText}>
                  Will be delivered to{" "}
                  <Text style={{ fontWeight: "700", color: theme.COLORS.text }}>
                    {withdrawToken.destinationChain}
                  </Text>{" "}
                  — enter a {withdrawToken.destinationChain} address below.
                </Text>
              </View>
            )}

            {/* Amount */}
            <FieldLabel theme={theme} label="Amount" />
            <BridgeInput
              theme={theme}
              value={withdrawAmount}
              onChangeText={(t) => {
                setWithdrawAmount(t.replace(/[^0-9.]/g, ""));
                if (withdrawErrors.amount)
                  setWithdrawErrors((p) => ({ ...p, amount: null }));
              }}
              placeholder="0.0"
              keyboardType="decimal-pad"
              error={withdrawErrors.amount}
              right={
                withdrawToken ? (
                  <TouchableOpacity
                    onPress={() => setWithdrawAmount(withdrawToken.balance)}
                  >
                    <Text style={S.maxBtn}>MAX</Text>
                  </TouchableOpacity>
                ) : null
              }
            />

            {/* Destination address toggle */}
            <FieldLabel
              theme={theme}
              label={
                withdrawToken
                  ? `Receive on ${withdrawToken.destinationChain}`
                  : "Destination Address"
              }
            />
            <SelfToggle
              theme={theme}
              isSelf={withdrawSelf}
              onToggle={(val) => {
                setWithdrawSelf(val);
                setWithdrawReceiver("");
                setWithdrawErrors((p) => ({ ...p, receiver: null }));
              }}
              selfLabel="My own address"
              otherLabel="Another address"
            />
            {!withdrawSelf && (
              <BridgeInput
                theme={theme}
                value={withdrawReceiver}
                onChangeText={(t) => {
                  setWithdrawReceiver(t);
                  if (withdrawErrors.receiver)
                    setWithdrawErrors((p) => ({ ...p, receiver: null }));
                }}
                placeholder={
                  withdrawToken
                    ? `Your ${withdrawToken.destinationChain} address`
                    : "0x…"
                }
                error={withdrawErrors.receiver}
                autoCapitalize="none"
              />
            )}
            {withdrawSelf && (
              <View style={S.selfAddressDisplay}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color={theme.COLORS.primary}
                />
                <Text
                  style={S.selfAddressText}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {address}
                </Text>
              </View>
            )}

            <InfoCard
              theme={theme}
              icon="flash-outline"
              text="ZetaChain automatically calculates and deducts the outbound gas fee from your ZRC-20 balance. No separate approval needed."
            />

            {withdrawableTokens.length === 0 && (
              <InfoCard
                theme={theme}
                icon="wallet-outline"
                text="You have no ZRC-20 balances to withdraw. Deposit tokens first using the Deposit tab."
                color={theme.COLORS.textSecondary}
              />
            )}

            <BridgeButton
              theme={theme}
              label="Continue →"
              onPress={handleWithdrawContinue}
              disabled={withdrawableTokens.length === 0}
            />
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            HISTORY TAB
            Live list of cross-chain transactions from useZetaTransactionManager.
            Each CCTX shows its multi-step lifecycle and hashes.
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "history" && (
          <>
            {txHistory.length === 0 ? (
              <View style={S.emptyHistory}>
                <Ionicons
                  name="git-branch-outline"
                  size={48}
                  color={theme.COLORS.textSecondary}
                />
                <Text style={S.emptyHistoryTitle}>No transactions yet</Text>
                <Text style={S.emptyHistoryText}>
                  Your cross-chain transactions will appear here. Each one shows
                  its full journey from source chain to destination.
                </Text>
              </View>
            ) : (
              txHistory.map((record) => (
                <CctxCard
                  key={record.id}
                  record={record}
                  theme={theme}
                  cctxExplorerUrl={cctxExplorerUrl}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* ── Chain picker modal ── */}
      <Modal
        visible={showChainPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowChainPicker(false)}
      >
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Select Source Chain</Text>
              <TouchableOpacity
                onPress={() => setShowChainPicker(false)}
                style={S.modalClose}
              >
                <Ionicons name="close" size={24} color={theme.COLORS.text} />
              </TouchableOpacity>
            </View>
            {CONNECTED_CHAINS.map((chain) => (
              <TouchableOpacity
                key={chain.id}
                style={[
                  S.chainItem,
                  depositChain.id === chain.id && S.chainItemSelected,
                ]}
                onPress={() => handleSelectChain(chain)}
                activeOpacity={0.7}
              >
                <View style={S.chainItemLeft}>
                  {chain.icon ? (
                    <Image
                      source={{ uri: chain.icon }}
                      style={S.chainItemIcon}
                    />
                  ) : (
                    <View
                      style={[S.chainDotLg, { backgroundColor: chain.color }]}
                    />
                  )}
                </View>
                <View style={S.chainItemInfo}>
                  <Text style={S.chainItemName}>{chain.name}</Text>
                  <Text style={S.chainItemSymbol}>{chain.symbol}</Text>
                </View>
                {depositChain.id === chain.id && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={theme.COLORS.primary}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── ZRC-20 token picker modal ── */}
      <Modal
        visible={showTokenPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTokenPicker(false)}
      >
        <View style={S.modalOverlay}>
          <View style={S.modalSheet}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Select Token</Text>
              <TouchableOpacity
                onPress={() => setShowTokenPicker(false)}
                style={S.modalClose}
              >
                <Ionicons name="close" size={24} color={theme.COLORS.text} />
              </TouchableOpacity>
            </View>
            {withdrawableTokens.length === 0 ? (
              <View style={S.emptyPicker}>
                <Text style={S.emptyPickerText}>
                  No ZRC-20 balances to withdraw
                </Text>
              </View>
            ) : (
              withdrawableTokens.map((token) => (
                <TouchableOpacity
                  key={token.id}
                  style={[
                    S.tokenPickerItem,
                    withdrawToken?.id === token.id && S.tokenPickerItemSelected,
                  ]}
                  onPress={() => {
                    setWithdrawToken(token);
                    setWithdrawErrors({});
                    setShowTokenPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      S.tokenAvatar,
                      { backgroundColor: symbolColor(token.symbol) },
                    ]}
                  >
                    <Text style={S.tokenAvatarText}>
                      {extractBase(token.symbol).substring(0, 2)}
                    </Text>
                  </View>
                  <View style={S.tokenPickerInfo}>
                    <Text style={S.tokenPickerSymbol}>{token.symbol}</Text>
                    <Text style={S.tokenPickerChain}>
                      {token.destinationChain}
                    </Text>
                  </View>
                  <Text style={S.tokenPickerBalance}>
                    {parseFloat(token.balance).toFixed(6)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>

      {/* ── Transaction modal ── */}
      <TransactionModal
        visible={txModalVisible}
        onClose={() => setTxModalVisible(false)}
        onSuccess={handleTxSuccess}
        onError={handleTxError}
        {...txModalProps}
      />
    </KeyboardAvoidingView>
  );
};

// ─── CCTX History Card ────────────────────────────────────────────────────────

const CctxCard = ({ record, theme, cctxExplorerUrl }) => {
  const S = createStyles(theme);
  const [expanded, setExpanded] = useState(false);

  const finalUi = finalStatuses[record.finalStatus] ?? finalStatuses.pending;
  const lastStep = record.steps?.[record.steps.length - 1];
  const cctxHash = lastStep?.cctxHash;
  const explorerUrl = cctxHash ? cctxExplorerUrl(cctxHash) : null;

  const typeLabels = {
    evm_deposit: "Deposit",
    evm_deposit_call: "Deposit & Call",
    withdraw_from_zeta: "Withdrawal",
    zeta_call: "Cross-Chain Call",
    evm_call: "EVM Call",
    native_zeta: "ZETA Send",
  };

  return (
    <View style={S.cctxCard}>
      {/* Card header */}
      <TouchableOpacity
        style={S.cctxCardHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={S.cctxLeft}>
          <View style={[S.cctxStatusDot, { backgroundColor: finalUi.color }]} />
          <View>
            <Text style={S.cctxType}>
              {typeLabels[record.type] ?? record.type}
            </Text>
            <Text style={S.cctxMeta}>
              {record.amount &&
                `${parseFloat(record.amount).toFixed(4)} ${record.tokenSymbol ?? ""}  ·  `}
              {new Date(record.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
        <View style={S.cctxRight}>
          <View
            style={[
              S.cctxStatusBadge,
              { backgroundColor: finalUi.color + "20" },
            ]}
          >
            <Text style={[S.cctxStatusText, { color: finalUi.color }]}>
              {finalUi.label}
            </Text>
          </View>
          {record.finalStatus === "pending" && (
            <ActivityIndicator
              size="small"
              color={finalUi.color}
              style={{ marginLeft: 6 }}
            />
          )}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.COLORS.textSecondary}
            style={{ marginLeft: 4 }}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded steps */}
      {expanded && (
        <View style={S.cctxSteps}>
          {record.steps.length === 0 ? (
            <Text style={S.cctxNoSteps}>
              Waiting for observer confirmation…
            </Text>
          ) : (
            record.steps.map((step, i) => {
              const ui = STATUS_UI[step.status] ?? {
                label: step.status,
                color: "#9CA3AF",
                icon: "ellipsis-horizontal",
              };
              const isLast = i === record.steps.length - 1;
              return (
                <View key={i} style={S.cctxStep}>
                  <View style={S.cctxStepLeft}>
                    <Ionicons name={ui.icon} size={16} color={ui.color} />
                    {!isLast && (
                      <View
                        style={[
                          S.cctxStepLine,
                          { backgroundColor: ui.color + "40" },
                        ]}
                      />
                    )}
                  </View>
                  <View style={S.cctxStepContent}>
                    <Text style={[S.cctxStepLabel, { color: ui.color }]}>
                      {ui.label}
                    </Text>
                    {step.inboundHash && (
                      <Text
                        style={S.cctxHash}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        Source: {step.inboundHash}
                      </Text>
                    )}
                    {step.cctxHash && (
                      <Text
                        style={S.cctxHash}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        CCTX: {step.cctxHash}
                      </Text>
                    )}
                    {step.outboundHash && (
                      <Text
                        style={S.cctxHash}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                      >
                        Dest: {step.outboundHash}
                      </Text>
                    )}
                    <Text style={S.cctxTime}>
                      {new Date(step.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
              );
            })
          )}

          {/* Explorer link */}
          {explorerUrl && (
            <TouchableOpacity
              style={S.explorerLink}
              onPress={() => Linking.openURL(explorerUrl)}
            >
              <Ionicons
                name="open-outline"
                size={14}
                color={theme.COLORS.primary}
              />
              <Text style={S.explorerLinkText}>
                View full CCTX on ZetaChain Explorer
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

// ─── Small shared sub-components ─────────────────────────────────────────────

const FlowDiagram = ({
  theme,
  leftLabel,
  leftColor,
  rightLabel,
  rightColor,
  label,
}) => {
  const S = createStyles(theme);
  return (
    <View style={S.flowDiagram}>
      <View style={[S.flowNode, { borderColor: leftColor }]}>
        <Text style={[S.flowNodeText, { color: leftColor }]} numberOfLines={1}>
          {leftLabel}
        </Text>
      </View>
      <View style={S.flowArrow}>
        <View
          style={[S.flowArrowLine, { backgroundColor: theme.COLORS.border }]}
        />
        <View
          style={[
            S.flowArrowLabelContainer,
            { backgroundColor: theme.COLORS.background },
          ]}
        >
          <Text style={S.flowArrowLabel}>{label}</Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={14}
          color={theme.COLORS.textSecondary}
        />
      </View>
      <View style={[S.flowNode, { borderColor: rightColor }]}>
        <Text style={[S.flowNodeText, { color: rightColor }]} numberOfLines={1}>
          {rightLabel}
        </Text>
      </View>
    </View>
  );
};

const FieldLabel = ({ theme, label, hint }) => {
  const S = createStyles(theme);
  return (
    <View style={S.fieldLabelRow}>
      <Text style={S.fieldLabel}>{label}</Text>
      {hint && <Text style={S.fieldHint}>{hint}</Text>}
    </View>
  );
};

const BridgeInput = ({
  theme,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  autoCapitalize,
  right,
}) => {
  const S = createStyles(theme);
  return (
    <>
      <View style={[S.bridgeInput, error && S.bridgeInputError]}>
        <TextInput
          style={S.bridgeInputText}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={
            theme.COLORS.textTertiary ?? theme.COLORS.textSecondary
          }
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize ?? "sentences"}
          autoCorrect={false}
        />
        {right && <View style={S.bridgeInputRight}>{right}</View>}
      </View>
      {error && <Text style={S.errorText}>{error}</Text>}
    </>
  );
};

const InfoCard = ({ theme, icon, text, color }) => {
  const S = createStyles(theme);
  return (
    <View style={S.infoCard}>
      <Ionicons name={icon} size={16} color={color ?? theme.COLORS.primary} />
      <Text style={S.infoCardText}>{text}</Text>
    </View>
  );
};

/**
 * SelfToggle — two-option pill selector for "My address" vs "Another address".
 * Replaces the always-visible address input that was previously shown with
 * a placeholder hint. Defaulting to "self" removes friction for the common
 * case and prevents users accidentally entering a wrong-network address.
 */
const SelfToggle = ({ theme, isSelf, onToggle, selfLabel, otherLabel }) => {
  const S = createStyles(theme);
  return (
    <View style={S.selfToggleRow}>
      <TouchableOpacity
        style={[S.selfToggleOption, isSelf && S.selfToggleOptionActive]}
        onPress={() => onToggle(true)}
        activeOpacity={0.75}
      >
        <View style={[S.selfToggleCheck, isSelf && S.selfToggleCheckActive]}>
          {isSelf && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
        <Text style={[S.selfToggleLabel, isSelf && S.selfToggleLabelActive]}>
          {selfLabel}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[S.selfToggleOption, !isSelf && S.selfToggleOptionActive]}
        onPress={() => onToggle(false)}
        activeOpacity={0.75}
      >
        <View style={[S.selfToggleCheck, !isSelf && S.selfToggleCheckActive]}>
          {!isSelf && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
        <Text style={[S.selfToggleLabel, !isSelf && S.selfToggleLabelActive]}>
          {otherLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const BridgeButton = ({ theme, label, onPress, disabled }) => {
  const S = createStyles(theme);
  return (
    <TouchableOpacity
      style={[S.bridgeBtn, disabled && S.bridgeBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={S.bridgeBtnText}>{label}</Text>
    </TouchableOpacity>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.COLORS.background },

    // Header
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    headerTitle: {
      fontSize: FONTS.sizes.xxl,
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    networkBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.COLORS.surface,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.COLORS.primary + "30",
    },
    networkDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#10B981",
    },
    networkBadgeText: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.COLORS.primary,
    },

    // Tabs
    tabs: {
      flexDirection: "row",
      paddingHorizontal: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.divider ?? theme.COLORS.border,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingVertical: 12,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabActive: { borderBottomColor: theme.COLORS.primary },
    tabLabel: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
    },
    tabLabelActive: { color: theme.COLORS.primary },
    tabBadge: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "#F59E0B",
      justifyContent: "center",
      alignItems: "center",
    },
    tabBadgeText: { fontSize: 9, fontWeight: "700", color: "#fff" },

    scroll: { flex: 1 },
    scrollContent: { padding: SPACING.md, paddingBottom: 40 },

    // Flow diagram
    flowDiagram: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
      gap: 0,
    },
    flowNode: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 2,
      maxWidth: 110,
    },
    flowNodeText: { fontSize: FONTS.sizes.sm, fontWeight: "700" },
    flowArrow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      marginHorizontal: 4,
    },
    flowArrowLine: { position: "absolute", left: 0, right: 0, height: 1 },
    flowArrowLabelContainer: { paddingHorizontal: 6 },
    flowArrowLabel: {
      fontSize: FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      fontWeight: "600",
    },

    // Fields
    fieldLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
      marginTop: SPACING.md,
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.COLORS.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    fieldHint: { fontSize: 10, color: theme.COLORS.textSecondary },
    errorText: { fontSize: 11, color: theme.COLORS.error, marginTop: 4 },

    // Selector (chain / token picker button)
    selector: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    chainDot: { width: 12, height: 12, borderRadius: 6 },
    chainDotLg: { width: 16, height: 16, borderRadius: 8 },
    selectorChainIcon: { width: 24, height: 24, borderRadius: 12 },
    chainItemLeft: { width: 28, alignItems: "center" },
    chainItemIcon: { width: 28, height: 28, borderRadius: 14 },
    selectorText: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.COLORS.text,
      flex: 1,
    },
    selectorSub: {
      fontSize: 12,
      color: theme.COLORS.textSecondary,
      marginRight: 4,
    },
    selectorTokenInfo: { flex: 1 },
    destinationPill: {
      backgroundColor: theme.COLORS.primary + "15",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    destinationPillText: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.COLORS.primary,
    },

    // Token avatar
    tokenAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },
    tokenAvatarText: { fontSize: 12, fontWeight: "700", color: "#fff" },

    // Destination card
    destinationCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: theme.COLORS.primary + "10",
      borderRadius: 10,
      padding: 12,
      marginTop: SPACING.sm,
      borderWidth: 1,
      borderColor: theme.COLORS.primary + "30",
    },
    destinationText: {
      flex: 1,
      fontSize: 12,
      color: theme.COLORS.textSecondary,
      lineHeight: 18,
    },

    // Bridge input
    bridgeInput: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "ios" ? 14 : 0,
      marginBottom: 0,
    },
    bridgeInputError: { borderColor: theme.COLORS.error },
    bridgeInputText: {
      flex: 1,
      fontSize: 15,
      color: theme.COLORS.text,
      paddingVertical: Platform.OS === "android" ? 12 : 0,
    },
    bridgeInputRight: { marginLeft: 8 },
    inputSuffix: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.COLORS.textSecondary,
    },
    maxBtn: { fontSize: 12, fontWeight: "700", color: theme.COLORS.primary },

    // Self / other address toggle
    selfToggleRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    selfToggleOption: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1.5,
      borderColor: theme.COLORS.border,
    },
    selfToggleOptionActive: {
      borderColor: theme.COLORS.primary,
      backgroundColor: theme.COLORS.primary + "08",
    },
    selfToggleCheck: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.COLORS.border,
      justifyContent: "center",
      alignItems: "center",
    },
    selfToggleCheckActive: {
      backgroundColor: theme.COLORS.primary,
      borderColor: theme.COLORS.primary,
    },
    selfToggleLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.COLORS.textSecondary,
      flex: 1,
    },
    selfToggleLabelActive: { color: theme.COLORS.primary },

    // Own address display shown when self is selected
    selfAddressDisplay: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.COLORS.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.COLORS.primary + "40",
      marginBottom: 0,
    },
    // Info card
    infoCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: theme.COLORS.surface,
      borderRadius: 10,
      padding: 12,
      marginTop: SPACING.md,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    infoCardText: {
      flex: 1,
      fontSize: 12,
      color: theme.COLORS.textSecondary,
      lineHeight: 18,
    },

    // Bridge CTA button
    bridgeBtn: {
      backgroundColor: theme.COLORS.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: SPACING.lg,
    },
    bridgeBtnDisabled: { opacity: 0.4 },
    bridgeBtnText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
      letterSpacing: 0.3,
    },

    // CCTX history
    emptyHistory: { alignItems: "center", paddingVertical: 60, gap: 12 },
    emptyHistoryTitle: {
      fontSize: FONTS.sizes.lg,
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    emptyHistoryText: {
      fontSize: FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 20,
    },

    cctxCard: {
      backgroundColor: theme.COLORS.surface,
      borderRadius: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      overflow: "hidden",
    },
    cctxCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 14,
    },
    cctxLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    cctxStatusDot: { width: 10, height: 10, borderRadius: 5 },
    cctxType: {
      fontSize: FONTS.sizes.sm,
      fontWeight: "700",
      color: theme.COLORS.text,
    },
    cctxMeta: {
      fontSize: FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    cctxRight: { flexDirection: "row", alignItems: "center" },
    cctxStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    cctxStatusText: { fontSize: FONTS.sizes.xs, fontWeight: "700" },

    cctxSteps: {
      borderTopWidth: 1,
      borderTopColor: theme.COLORS.border,
      padding: 14,
      gap: 0,
    },
    cctxNoSteps: {
      fontSize: FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      fontStyle: "italic",
    },
    cctxStep: { flexDirection: "row", gap: 10, marginBottom: 14 },
    cctxStepLeft: { alignItems: "center", width: 20 },
    cctxStepLine: { width: 2, flex: 1, marginTop: 4, marginBottom: -8 },
    cctxStepContent: { flex: 1, gap: 2 },
    cctxStepLabel: { fontSize: FONTS.sizes.sm, fontWeight: "600" },
    cctxHash: {
      fontSize: 10,
      color: theme.COLORS.textSecondary,
      fontFamily: "monospace",
    },
    cctxTime: {
      fontSize: 10,
      color: theme.COLORS.textTertiary ?? theme.COLORS.textSecondary,
      marginTop: 2,
    },

    explorerLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.COLORS.border,
    },
    explorerLinkText: {
      fontSize: FONTS.sizes.xs,
      color: theme.COLORS.primary,
      fontWeight: "600",
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: theme.COLORS.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 32,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border,
    },
    modalTitle: { fontSize: 16, fontWeight: "700", color: theme.COLORS.text },
    modalClose: { padding: 4 },

    chainItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border + "60",
    },
    chainItemSelected: { backgroundColor: theme.COLORS.primary + "08" },
    chainItemInfo: { flex: 1 },
    chainItemName: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    chainItemSymbol: {
      fontSize: 12,
      color: theme.COLORS.textSecondary,
      marginTop: 1,
    },

    emptyPicker: { padding: 24, alignItems: "center" },
    emptyPickerText: {
      fontSize: FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
    },

    tokenPickerItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.border + "60",
    },
    tokenPickerItemSelected: { backgroundColor: theme.COLORS.primary + "08" },
    tokenPickerInfo: { flex: 1 },
    tokenPickerSymbol: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    tokenPickerChain: {
      fontSize: 11,
      color: theme.COLORS.textSecondary,
      marginTop: 2,
    },
    tokenPickerBalance: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
  });

export default BridgeScreen;
