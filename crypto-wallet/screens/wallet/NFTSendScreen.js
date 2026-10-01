import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../../contexts/WalletContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useChain } from "../../contexts/ChainContext";
import { TransactionModal } from "../../components/TransactionModal";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Card from "../../components/common/Card";
import NFTImage from "../../components/common/NFTImage";
import { isValidAddress, formatAddress } from "../../utils/Wallet";
import { estimateNFTTransferGas } from "../../services/blockchain";
import { saveTransaction } from "../../utils/Database";
import Alert from "../../utils/Alert";

// ERC721 ABI for NFT transfers
const ERC721_ABI = [
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
];

// ERC1155 ABI for multi-token standard
const ERC1155_ABI = [
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

const NFTSendScreen = ({ navigation, route }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { nft, chain } = route.params;
  const { wallet, refreshBalances } = useWallet();
  const { activeChain, switchChain } = useChain();

  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);
  const [gasEstimate, setGasEstimate] = useState(null);
  const [estimatingGas, setEstimatingGas] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [isWrongChain, setIsWrongChain] = useState(false);

  // Check if user is on the correct chain
  useEffect(() => {
    const wrongChain = activeChain.id !== chain.id;
    setIsWrongChain(wrongChain);

    if (wrongChain) {
      // Clear gas estimate when on wrong chain
      setGasEstimate(null);
    }
  }, [activeChain, chain]);

  useEffect(() => {
    // Only estimate gas if on correct chain
    if (recipient && isValidAddress(recipient) && !isWrongChain) {
      estimateGas();
    } else {
      setGasEstimate(null);
    }
  }, [recipient, isWrongChain]);

  const estimateGas = async () => {
    try {
      setEstimatingGas(true);
      const estimate = await estimateNFTTransferGas(
        wallet.address,
        nft.contract.address,
        recipient,
        nft.tokenId,
        nft.tokenType || "ERC721",
        chain,
      );
      setGasEstimate(estimate);
    } catch (error) {
      console.error("Error estimating gas:", error);

      // Check for specific error types
      if (error.message?.includes("insufficient funds")) {
        Alert.alert(
          "Insufficient Funds",
          `You don't have enough ${chain.symbol} to cover the gas fees for this transaction.`,
        );
      } else {
        Alert.alert("Error", "Failed to estimate gas fee. Please try again.");
      }
      setGasEstimate(null);
    } finally {
      setEstimatingGas(false);
    }
  };

  const handleSwitchChain = async () => {
    try {
      setLoading(true);
      await switchChain(chain);
      Alert.alert(
        "Network Switched",
        `You are now connected to ${chain.name}. You can proceed with the transfer.`,
      );
    } catch (error) {
      console.error("Error switching chain:", error);
      Alert.alert(
        "Switch Failed",
        "Failed to switch network. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    // Validate chain first
    if (isWrongChain) {
      Alert.alert(
        "Wrong Network",
        `This NFT is on ${chain.name}. Please switch to ${chain.name} network to send this NFT.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Switch Network",
            onPress: handleSwitchChain,
          },
        ],
      );
      return;
    }

    if (!recipient) {
      Alert.alert("Error", "Please enter recipient address");
      return;
    }

    if (!isValidAddress(recipient)) {
      Alert.alert("Error", "Invalid recipient address");
      return;
    }

    if (recipient.toLowerCase() === wallet.address.toLowerCase()) {
      Alert.alert("Error", "Cannot send to your own address");
      return;
    }

    if (!gasEstimate) {
      Alert.alert("Error", "Gas estimation failed. Please try again.");
      return;
    }

    // Open transaction modal
    setShowTransactionModal(true);
  };

  const handleTransactionSuccess = async (receipt) => {
    // Show waiting for confirmation message
    Alert.alert(
      "Transaction Submitted",
      "Your transaction has been submitted to the blockchain. Waiting for confirmation...",
      [{ text: "OK" }],
    );

    try {
      // The receipt here should already be confirmed by the TransactionModal
      // but we'll add extra validation
      if (receipt.status === 0) {
        throw new Error("Transaction failed on blockchain");
      }

      console.log("[NFTSendScreen] NFT transfer confirmed:", receipt);

      // Save transaction to database (wallet.id and chain.id as separate params)
      await saveTransaction(wallet.id, chain.id, {
        hash: receipt.hash,
        from: wallet.address,
        to: recipient,
        amount: "0", // NFT transfers have no ETH value
        tokenAddress: nft.contract.address,
        tokenId: nft.tokenId,
        type: "nft_transfer",
        status: "success",
        gasUsed: receipt.gasUsed?.toString(),
        gasPrice:
          receipt.gasPrice?.toString() || receipt.effectiveGasPrice?.toString(),
      });

      // Refresh balances to update NFT list
      await refreshBalances();

      // Show success and navigate back
      Alert.alert(
        "NFT Sent Successfully!",
        `${nft.name || nft.title || `Token #${nft.tokenId}`} has been successfully transferred to ${formatAddress(recipient, 8)}.\n\nTransaction Hash: ${formatAddress(receipt.hash, 12)}`,
        [
          {
            text: "View NFTs",
            onPress: () => {
              navigation.navigate("NFTs");
            },
          },
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      console.error(
        "[NFTSendScreen] Error processing confirmed transaction:",
        error,
      );

      Alert.alert(
        "Transaction Confirmed",
        "Your NFT was transferred, but there was an error saving the transaction details. Please check your wallet to verify.",
        [
          {
            text: "OK",
            onPress: () => navigation.goBack(),
          },
        ],
      );
    }
  };

  const handleTransactionError = (error) => {
    console.error("[NFTSendScreen] NFT transfer failed:", error);

    // Don't show alert for cancelled transactions
    if (error?.type === "cancelled" || error?.code === "ACTION_REJECTED") {
      return;
    }

    // Handle specific error cases
    let title = "Transfer Failed";
    let message = "An error occurred while transferring your NFT.";

    if (error?.message?.includes("insufficient funds")) {
      title = "Insufficient Funds";
      message = `You don't have enough ${chain.symbol} to cover the gas fees for this transaction.`;
    } else if (error?.message?.includes("gas required exceeds")) {
      title = "Gas Limit Exceeded";
      message =
        "The transaction requires more gas than the limit. Please try again.";
    } else if (error?.message?.includes("nonce")) {
      title = "Transaction Nonce Error";
      message =
        "There was a conflict with transaction ordering. Please try again.";
    } else if (error?.message?.includes("not owner")) {
      title = "Ownership Error";
      message = "You are not the owner of this NFT.";
    } else if (error?.message?.includes("already spent")) {
      title = "Transaction Already Processed";
      message = "This transaction may have already been processed.";
    } else if (error?.code === "NETWORK_ERROR") {
      title = "Network Error";
      message =
        "Unable to connect to the blockchain. Please check your connection and try again.";
    } else if (error?.message) {
      message = error.message;
    }

    Alert.alert(title, message);
  };

  // Prepare transaction configuration based on NFT type
  const getTransactionConfig = () => {
    if (!nft || !recipient) return null;

    const tokenType = nft.tokenType || "ERC721";

    if (tokenType === "ERC1155") {
      // ERC1155: safeTransferFrom(from, to, id, amount, data)
      return {
        contractAddress: nft.contract.address,
        contractABI: ERC1155_ABI,
        functionName: "safeTransferFrom",
        args: [
          wallet.address,
          recipient,
          nft.tokenId,
          1, // amount - typically 1 for NFTs
          "0x", // empty data
        ],
        value: "0",
      };
    } else {
      // ERC721: safeTransferFrom(from, to, tokenId)
      return {
        contractAddress: nft.contract.address,
        contractABI: ERC721_ABI,
        functionName: "safeTransferFrom",
        args: [wallet.address, recipient, nft.tokenId],
        value: "0",
      };
    }
  };

  const txConfig = getTransactionConfig();
  const nftDisplayName = nft.name || nft.title || `Token #${nft.tokenId}`;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Send NFT</Text>
          <Text style={styles.subtitle}>
            Transfer your NFT to another address
          </Text>
        </View>

        {/* Wrong Chain Warning */}
        {isWrongChain && (
          <Card style={styles.errorCard}>
            <Ionicons
              name="alert-circle-outline"
              size={24}
              color={theme.COLORS.error}
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Wrong Network</Text>
              <Text style={styles.errorText}>
                This NFT is on {chain.name}. You are currently connected to{" "}
                {activeChain.name}.
              </Text>
              <Button
                title={`Switch to ${chain.name}`}
                onPress={handleSwitchChain}
                loading={loading}
                style={styles.switchButton}
                size="small"
              />
            </View>
          </Card>
        )}

        {/* NFT Preview */}
        <Card style={styles.nftCard}>
          <View style={styles.nftPreview}>
            <NFTImage nft={nft} style={styles.nftImage} />
            <View style={styles.nftInfo}>
              <Text style={styles.nftName} numberOfLines={2}>
                {nftDisplayName}
              </Text>
              <Text style={styles.nftCollection} numberOfLines={1}>
                {nft.contract?.name}
              </Text>
              <View style={styles.nftMetadata}>
                <View style={styles.nftChainBadge}>
                  {chain.icon && (
                    <Image
                      source={{ uri: chain.icon }}
                      style={styles.nftChainIcon}
                    />
                  )}
                  <Text style={styles.nftChainName}>{chain.name}</Text>
                </View>
                <View style={styles.nftTypeBadge}>
                  <Text style={styles.nftTypeText}>
                    {nft.tokenType || "ERC721"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* From */}
        <Card style={styles.addressCard}>
          <Text style={styles.cardLabel}>From</Text>
          <View style={styles.addressRow}>
            <Ionicons
              name="wallet-outline"
              size={20}
              color={theme.COLORS.primary}
            />
            <Text style={styles.addressText}>
              {formatAddress(wallet.address, 8)}
            </Text>
          </View>
        </Card>

        {/* Recipient Input */}
        <Input
          label="Recipient Address"
          value={recipient}
          onChangeText={setRecipient}
          placeholder="0x..."
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.recipientInput}
          editable={!isWrongChain}
        />

        {/* Gas Estimate */}
        {estimatingGas && !isWrongChain && (
          <Card style={styles.gasCard}>
            <View style={styles.gasLoadingRow}>
              <Ionicons
                name="time-outline"
                size={20}
                color={theme.COLORS.primary}
              />
              <Text style={styles.gasLabel}>Estimating gas fee...</Text>
            </View>
          </Card>
        )}

        {gasEstimate && !estimatingGas && !isWrongChain && (
          <Card style={styles.gasCard}>
            <View style={styles.gasHeader}>
              <Text style={styles.gasLabel}>Network Fee</Text>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={theme.COLORS.textSecondary}
              />
            </View>
            <View style={styles.gasDetails}>
              <View style={styles.gasRow}>
                <Text style={styles.gasText}>Gas Limit:</Text>
                <Text style={styles.gasValue}>{gasEstimate.gasLimit}</Text>
              </View>
              <View style={styles.gasRow}>
                <Text style={styles.gasText}>Gas Price:</Text>
                <Text style={styles.gasValue}>
                  {parseFloat(gasEstimate.gasPriceGwei).toFixed(2)} Gwei
                </Text>
              </View>
              <View style={styles.gasTotalRow}>
                <Text style={styles.gasTotalText}>Total Fee:</Text>
                <Text style={styles.gasTotalValue}>
                  {parseFloat(gasEstimate.totalCost).toFixed(6)} {chain.symbol}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Warning */}
        <Card style={styles.warningCard}>
          <Ionicons
            name="warning-outline"
            size={24}
            color={theme.COLORS.warning}
          />
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Important</Text>
            <Text style={styles.warningText}>
              Please verify the recipient address carefully. NFT transfers
              cannot be reversed once confirmed on the blockchain.
            </Text>
          </View>
        </Card>

        {/* Transaction Summary */}
        {recipient &&
          isValidAddress(recipient) &&
          gasEstimate &&
          !isWrongChain && (
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Transfer Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>NFT:</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {nftDisplayName}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Collection:</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {nft.contract?.name || "Unknown"}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Network:</Text>
                <Text style={styles.summaryValue}>{chain.name}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>To:</Text>
                <Text style={[styles.summaryValue, styles.summaryAddressValue]}>
                  {formatAddress(recipient, 12)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabelBold}>Network Fee:</Text>
                <Text style={styles.summaryValueBold}>
                  {parseFloat(gasEstimate.totalCost).toFixed(6)} {chain.symbol}
                </Text>
              </View>
            </Card>
          )}

        {/* Send Button */}
        <Button
          title={isWrongChain ? `Switch to ${chain.name}` : "Continue"}
          onPress={isWrongChain ? handleSwitchChain : handleNext}
          loading={loading}
          disabled={
            !recipient ||
            !isValidAddress(recipient) ||
            (!isWrongChain && !gasEstimate) ||
            estimatingGas
          }
          fullWidth
          style={styles.sendButton}
        />

        <Text style={styles.helperText}>
          {isWrongChain
            ? `Switch to ${chain.name} network to continue`
            : "Review all details carefully before confirming"}
        </Text>
      </ScrollView>

      {/* Transaction Modal */}
      {txConfig && !isWrongChain && (
        <TransactionModal
          visible={showTransactionModal}
          onClose={() => setShowTransactionModal(false)}
          contractAddress={txConfig.contractAddress}
          contractABI={txConfig.contractABI}
          functionName={txConfig.functionName}
          args={txConfig.args}
          value={txConfig.value}
          title={`Transfer ${nft.tokenType || "NFT"}`}
          description={`You are about to transfer "${nftDisplayName}" from ${nft.contract?.name} to ${formatAddress(recipient, 12)} on ${chain.name}`}
          onSuccess={handleTransactionSuccess}
          onError={handleTransactionError}
          chain={chain}
        />
      )}
    </View>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.COLORS.background,
    },
    content: {
      padding: theme.SPACING.lg,
      paddingBottom: theme.SPACING.xxl || theme.SPACING.xl,
    },
    header: {
      alignItems: "center",
      marginBottom: theme.SPACING.lg,
    },
    title: {
      fontSize: theme.FONTS.sizes.xxl,
      fontWeight: "bold",
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.xs,
    },
    subtitle: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.textSecondary,
    },
    errorCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
      backgroundColor: `${theme.COLORS.error}15`,
      flexDirection: "row",
      gap: theme.SPACING.sm,
      alignItems: "flex-start",
      borderLeftWidth: 3,
      borderLeftColor: theme.COLORS.error,
    },
    errorContent: {
      flex: 1,
    },
    errorTitle: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      color: theme.COLORS.error,
      marginBottom: 4,
    },
    errorText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.error,
      lineHeight: 20,
      marginBottom: theme.SPACING.sm,
    },
    switchButton: {
      marginTop: theme.SPACING.xs,
    },
    nftCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    nftPreview: {
      flexDirection: "row",
      gap: theme.SPACING.md,
    },
    nftImage: {
      width: 100,
      height: 100,
      borderRadius: 12,
      backgroundColor: theme.COLORS.background,
    },
    nftInfo: {
      flex: 1,
      justifyContent: "center",
    },
    nftName: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.text,
      marginBottom: 4,
    },
    nftCollection: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      marginBottom: theme.SPACING.xs,
    },
    nftMetadata: {
      flexDirection: "row",
      gap: theme.SPACING.xs,
      flexWrap: "wrap",
    },
    nftChainBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.COLORS.surface,
      paddingHorizontal: theme.SPACING.xs,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
    },
    nftChainIcon: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    nftChainName: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.text,
      fontWeight: "500",
    },
    nftTypeBadge: {
      backgroundColor: `${theme.COLORS.primary}20`,
      paddingHorizontal: theme.SPACING.xs,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme.COLORS.primary}40`,
    },
    nftTypeText: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.primary,
      fontWeight: "600",
    },
    addressCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    cardLabel: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      marginBottom: theme.SPACING.xs,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    addressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.SPACING.xs,
    },
    addressText: {
      fontSize: theme.FONTS.sizes.md,
      color: theme.COLORS.text,
      fontWeight: "500",
      fontFamily: "monospace",
    },
    recipientInput: {
      marginBottom: theme.SPACING.md,
    },
    gasCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
    },
    gasLoadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.SPACING.sm,
    },
    gasHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.SPACING.sm,
    },
    gasLabel: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    gasDetails: {
      gap: theme.SPACING.xs,
    },
    gasRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    gasText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
    },
    gasValue: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
    },
    gasTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: theme.SPACING.xs,
      paddingTop: theme.SPACING.xs,
      borderTopWidth: 1,
      borderTopColor: theme.COLORS.border,
    },
    gasTotalText: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    gasTotalValue: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.primary,
    },
    warningCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
      backgroundColor: `${theme.COLORS.warning}15`,
      flexDirection: "row",
      gap: theme.SPACING.sm,
      alignItems: "flex-start",
      borderLeftWidth: 3,
      borderLeftColor: theme.COLORS.warning,
    },
    warningContent: {
      flex: 1,
    },
    warningTitle: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "600",
      color: theme.COLORS.warning,
      marginBottom: 4,
    },
    warningText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.warning,
      lineHeight: 20,
    },
    summaryCard: {
      padding: theme.SPACING.md,
      marginBottom: theme.SPACING.md,
      backgroundColor: theme.COLORS.surface,
      borderWidth: 1,
      borderColor: `${theme.COLORS.primary}30`,
    },
    summaryTitle: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: "bold",
      color: theme.COLORS.text,
      marginBottom: theme.SPACING.sm,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: theme.SPACING.xs,
    },
    summaryLabel: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      flex: 1,
    },
    summaryValue: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.text,
      flex: 2,
      textAlign: "right",
    },
    summaryAddressValue: {
      fontFamily: "monospace",
      fontSize: theme.FONTS.sizes.xs,
    },
    summaryLabelBold: {
      fontSize: theme.FONTS.sizes.sm,
      fontWeight: "600",
      color: theme.COLORS.text,
    },
    summaryValueBold: {
      fontSize: theme.FONTS.sizes.sm,
      fontWeight: "bold",
      color: theme.COLORS.primary,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: theme.COLORS.border,
      marginVertical: theme.SPACING.sm,
    },
    sendButton: {
      marginBottom: theme.SPACING.sm,
    },
    helperText: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      textAlign: "center",
    },
  });

export default NFTSendScreen;
