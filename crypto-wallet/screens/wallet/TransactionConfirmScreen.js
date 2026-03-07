import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
} from "react-native";
import { useWallet } from "../../contexts/WalletContext";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Card from "../../components/common/Card";
import { COLORS, SPACING, FONTS } from "../../constants/Theme";
import {
  sendNativeToken,
  sendToken,
  sendNFT,
  waitForTransactionReceipt,
} from "../../services/blockchain";
import { saveTransaction } from "../../utils/Database";
import { formatAddress } from "../../utils/Wallet";
import Alert from "../../utils/Alert";

const TransactionConfirmScreen = ({ navigation, route }) => {
  const { type, token, recipient, amount, gasEstimate, chain, nft } =
    route.params;
  const { wallet, unlockWallet, refreshBalance } = useWallet();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [txStatus, setTxStatus] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  const isTokenTransfer = type === "token";

  const handleConfirm = async () => {
    if (!password) {
      Alert.alert("Error", "Please enter your wallet password");
      return;
    }

    try {
      setLoading(true);

      // Unlock wallet to get private key
      const walletData = await unlockWallet(password);

      // Send transaction based on type
      let hash;
      if (type === "nft") {
        hash = await sendNFT(
          walletData.privateKey,
          nft.contract.address,
          recipient,
          nft.tokenId,
          nft.tokenType || "ERC721",
          chain,
        );
      } else if (type === "token") {
        hash = await sendToken(
          walletData.privateKey,
          token.address,
          recipient,
          amount,
          token.decimals,
          chain,
        );
      } else {
        hash = await sendNativeToken(
          walletData.privateKey,
          recipient,
          amount,
          chain,
        );
      }

      setTxHash(hash);
      setShowStatusModal(true);
      setTxStatus("pending");

      // Save transaction to database
      await saveTransaction(wallet.id, chain.id, {
        hash,
        from: wallet.address,
        to: recipient,
        amount: type === "nft" ? "1" : amount,
        tokenAddress:
          type === "nft"
            ? nft.contract.address
            : type === "token"
              ? token.address
              : null,
        tokenId: type === "nft" ? nft.tokenId : null,
        type,
        status: "pending",
      });

      // Wait for confirmation
      const receipt = await waitForTransactionReceipt(hash, chain);
      setTxStatus(receipt.status);

      // Update transaction status in database
      await saveTransaction(wallet.id, chain.id, {
        hash,
        from: wallet.address,
        to: recipient,
        amount: type === "nft" ? "1" : amount,
        gasUsed: receipt.gasUsed,
        status: receipt.status,
      });

      // Refresh balance
      await refreshBalance();

      // Clear password
      setPassword("");

      if (receipt.status === "success") {
        Alert.alert("Success", "Transaction confirmed successfully!", [
          {
            text: "OK",
            onPress: () => navigation.navigate("Main", { screen: "HomeTab" }),
          },
        ]);
      } else {
        Alert.alert("Failed", "Transaction failed. Please try again.");
      }
    } catch (error) {
      console.error("Transaction error:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to send transaction. Please try again.",
      );
      setTxStatus("failed");
    } finally {
      setLoading(false);
    }
  };

  const viewOnExplorer = () => {
    if (txHash) {
      const url = `${chain.explorer}/tx/${txHash}`;
      // Open URL - you'll need to import Linking from 'react-native'
      console.log("Open:", url);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Confirm Transaction</Text>
          <Text style={styles.subtitle}>
            Review and confirm your transaction
          </Text>
        </View>

        {/* Transaction Details */}
        <Card style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Transaction Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type:</Text>
            <Text style={styles.detailValue}>
              {type === "nft"
                ? "NFT Transfer"
                : isTokenTransfer
                  ? "Token Transfer"
                  : "Native Transfer"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Network:</Text>
            <Text style={styles.detailValue}>{chain.name}</Text>
          </View>

          {/* NFT Preview */}
          {type === "nft" && nft && (
            <View style={styles.nftPreview}>
              <Image
                source={{
                  uri: nft.image?.cachedUrl || nft.image?.thumbnailUrl,
                }}
                style={styles.nftImage}
              />
              <View>
                <Text style={styles.nftName}>
                  {nft.name || `#${nft.tokenId}`}
                </Text>
                <Text style={styles.nftCollection}>{nft.contract?.name}</Text>
              </View>
            </View>
          )}

          {isTokenTransfer && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Token:</Text>
              <Text style={styles.detailValue}>{token.symbol}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>From:</Text>
            <Text style={styles.detailValue}>
              {formatAddress(wallet.address)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>To:</Text>
            <Text style={styles.detailValue}>{formatAddress(recipient)}</Text>
          </View>

          {type !== "nft" && (
            <View style={[styles.detailRow, styles.amountRow]}>
              <Text style={styles.detailLabel}>Amount:</Text>
              <Text style={styles.amountValue}>
                {amount} {isTokenTransfer ? token.symbol : chain.symbol}
              </Text>
            </View>
          )}
        </Card>

        {/* Gas Details */}
        {gasEstimate && (
          <Card style={styles.gasCard}>
            <Text style={styles.sectionTitle}>Gas Fee</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Gas Limit:</Text>
              <Text style={styles.detailValue}>{gasEstimate.gasLimit}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Gas Price:</Text>
              <Text style={styles.detailValue}>
                {parseFloat(gasEstimate.gasPriceGwei).toFixed(2)} Gwei
              </Text>
            </View>

            <View style={[styles.detailRow, styles.gasRow]}>
              <Text style={styles.detailLabel}>Total Gas Fee:</Text>
              <Text style={styles.gasValue}>
                {parseFloat(gasEstimate.totalCost).toFixed(6)} {chain.symbol}
              </Text>
            </View>
          </Card>
        )}

        {/* Total Cost */}
        {type !== "nft" && (
          <Card style={styles.totalCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Cost:</Text>
              <Text style={styles.totalValue}>
                {isTokenTransfer
                  ? `${amount} ${token.symbol} + ${parseFloat(gasEstimate.totalCost).toFixed(6)} ${chain.symbol}`
                  : `${(parseFloat(amount) + parseFloat(gasEstimate.totalCost)).toFixed(6)} ${chain.symbol}`}
              </Text>
            </View>
          </Card>
        )}

        {/* Password Input */}
        <Input
          label="Wallet Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password to confirm"
          secureTextEntry
        />

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Confirm & Send"
            onPress={handleConfirm}
            loading={loading}
            disabled={!password || loading}
            fullWidth
          />
          <Button
            title="Cancel"
            onPress={() => navigation.goBack()}
            variant="outline"
            fullWidth
            disabled={loading}
            style={styles.cancelButton}
          />
        </View>
      </ScrollView>

      {/* Transaction Status Modal */}
      <Modal visible={showStatusModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            {txStatus === "pending" && (
              <>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.modalTitle}>Processing Transaction</Text>
                <Text style={styles.modalText}>
                  Please wait while your transaction is being confirmed...
                </Text>
              </>
            )}

            {txStatus === "success" && (
              <>
                <Text style={styles.successEmoji}>✅</Text>
                <Text style={styles.modalTitle}>Transaction Successful!</Text>
                <Text style={styles.modalText}>
                  Your transaction has been confirmed on the blockchain.
                </Text>
              </>
            )}

            {txStatus === "failed" && (
              <>
                <Text style={styles.errorEmoji}>❌</Text>
                <Text style={styles.modalTitle}>Transaction Failed</Text>
                <Text style={styles.modalText}>
                  Your transaction could not be completed. Please try again.
                </Text>
              </>
            )}

            {txHash && (
              <>
                <Text style={styles.hashLabel}>Transaction Hash:</Text>
                <Text style={styles.hashValue}>{formatAddress(txHash, 8)}</Text>
              </>
            )}

            {txStatus !== "pending" && (
              <View style={styles.modalActions}>
                {txHash && (
                  <Button
                    title="View on Explorer"
                    onPress={viewOnExplorer}
                    variant="outline"
                    size="small"
                    style={styles.modalButton}
                  />
                )}
                <Button
                  title="Close"
                  onPress={() => {
                    setShowStatusModal(false);
                    navigation.navigate("Main", { screen: "HomeTab" });
                  }}
                  size="small"
                  style={styles.modalButton}
                />
              </View>
            )}
          </Card>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: "bold",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
  },
  detailsCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  detailLabel: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
  },
  detailValue: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text,
  },
  amountRow: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  amountValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  nftPreview: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  nftImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: SPACING.md,
  },
  nftName: {
    fontSize: FONTS.sizes.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  nftCollection: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  gasCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  gasRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  gasValue: {
    fontSize: FONTS.sizes.md,
    fontWeight: "bold",
    color: COLORS.text,
  },
  totalCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.primary,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "bold",
    color: COLORS.background,
  },
  totalValue: {
    fontSize: FONTS.sizes.lg,
    fontWeight: "bold",
    color: COLORS.background,
  },
  actions: {
    marginTop: SPACING.md,
  },
  cancelButton: {
    marginTop: SPACING.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  modalCard: {
    width: "100%",
    padding: SPACING.xl,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: "bold",
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  modalText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  successEmoji: {
    fontSize: 64,
  },
  errorEmoji: {
    fontSize: 64,
  },
  hashLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  hashValue: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    fontWeight: "500",
    marginTop: SPACING.xs,
  },
  modalActions: {
    width: "100%",
    marginTop: SPACING.lg,
  },
  modalButton: {
    width: "100%",
    marginBottom: SPACING.sm,
  },
});

export default TransactionConfirmScreen;
