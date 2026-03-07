// components/QuickTransactionModals.js
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../constants/Theme';
import { useTransactionManager } from '../hooks/useTransactionManager';
import { useWallet } from '../contexts/WalletContext';

/**
 * Simple Transaction Confirmation Modal
 * For quick transactions that don't need detailed review
 */
export const QuickTransactionModal = ({
  visible,
  onClose,
  contractAddress,
  contractABI,
  functionName,
  args = [],
  value = "0",
  title = "Confirm Transaction",
  message = "Do you want to proceed with this transaction?",
  onSuccess,
  onError,
}) => {
  const { executeTransaction, isEstimating, error } = useTransactionManager();
  const { signerWithProvider } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    
    try {
      const receipt = await executeTransaction({
        address: contractAddress,
        abi: contractABI,
        functionName,
        args,
        value,
      });
      
      if (onSuccess) {
        onSuccess(receipt);
      }
      
      onClose();
    } catch (err) {
      console.error('Transaction failed:', err);
      
      if (onError) {
        onError(err);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.quickModal}>
          <Text style={styles.quickTitle}>{title}</Text>
          <Text style={styles.quickMessage}>{message}</Text>

          {error && (
            <View style={styles.quickError}>
              <Text style={styles.quickErrorText}>{error.message}</Text>
            </View>
          )}

          {isProcessing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          ) : (
            <View style={styles.quickButtons}>
              <TouchableOpacity 
                style={styles.quickCancelButton} 
                onPress={onClose}
                disabled={isProcessing}
              >
                <Text style={styles.quickCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.quickConfirmButton} 
                onPress={handleConfirm}
                disabled={isProcessing || !signerWithProvider}
              >
                <Text style={styles.quickConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

/**
 * Gas Estimation Preview Modal
 * Shows gas estimate before user confirms
 */
export const GasEstimateModal = ({
  visible,
  onClose,
  contractAddress,
  contractABI,
  functionName,
  args = [],
  value = "0",
  onProceed,
}) => {
  const { estimateGas, gasInfo, isEstimating, error } = useTransactionManager();
  const [hasEstimated, setHasEstimated] = useState(false);

  React.useEffect(() => {
    if (visible && !hasEstimated) {
      handleEstimate();
    }
  }, [visible]);

  const handleEstimate = async () => {
    try {
      await estimateGas({
        address: contractAddress,
        abi: contractABI,
        functionName,
        args,
        value,
      });
      setHasEstimated(true);
    } catch (err) {
      console.error('Gas estimation failed:', err);
    }
  };

  const handleProceed = () => {
    if (onProceed) {
      onProceed(gasInfo);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.gasModal}>
          <Text style={styles.gasTitle}>Gas Estimate</Text>

          {isEstimating ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Calculating gas...</Text>
            </View>
          ) : error ? (
            <View style={styles.gasError}>
              <Text style={styles.gasErrorTitle}>{error.title}</Text>
              <Text style={styles.gasErrorMessage}>{error.message}</Text>
            </View>
          ) : gasInfo ? (
            <View style={styles.gasDetails}>
              <GasRow label="Gas Limit" value={gasInfo.gasLimit} />
              <GasRow label="Gas Price" value={`${gasInfo.gasPrice} Gwei`} />
              <GasRow 
                label="Estimated Cost" 
                value={`${gasInfo.estimatedCostEth.toFixed(6)} ETH`}
                highlight 
              />
              {gasInfo.maxFeePerGas && (
                <GasRow label="Max Fee" value={`${gasInfo.maxFeePerGas} Gwei`} />
              )}
            </View>
          ) : null}

          <View style={styles.gasButtons}>
            <TouchableOpacity 
              style={styles.gasCancelButton} 
              onPress={onClose}
            >
              <Text style={styles.gasCancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.gasProceedButton, (!gasInfo || error) && styles.disabledButton]} 
              onPress={handleProceed}
              disabled={!gasInfo || error}
            >
              <Text style={styles.gasProceedText}>Proceed</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/**
 * Transaction Status Modal
 * Shows transaction progress and result
 */
export const TransactionStatusModal = ({
  visible,
  onClose,
  status = 'pending', // 'pending' | 'success' | 'error'
  txHash = null,
  errorMessage = null,
  blockNumber = null,
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return <ActivityIndicator size="large" color={COLORS.primary} />;
      case 'success':
        return <Text style={styles.statusIconSuccess}>✅</Text>;
      case 'error':
        return <Text style={styles.statusIconError}>❌</Text>;
      default:
        return null;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'pending':
        return 'Transaction Pending';
      case 'success':
        return 'Transaction Successful';
      case 'error':
        return 'Transaction Failed';
      default:
        return 'Transaction Status';
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'pending':
        return 'Your transaction is being processed on the blockchain...';
      case 'success':
        return 'Your transaction has been confirmed!';
      case 'error':
        return errorMessage || 'The transaction failed. Please try again.';
      default:
        return '';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={status !== 'pending' ? onClose : undefined}
    >
      <View style={styles.overlay}>
        <View style={styles.statusModal}>
          <View style={styles.statusIconContainer}>
            {getStatusIcon()}
          </View>

          <Text style={styles.statusTitle}>{getStatusTitle()}</Text>
          <Text style={styles.statusMessage}>{getStatusMessage()}</Text>

          {txHash && (
            <View style={styles.statusDetails}>
              <Text style={styles.statusLabel}>Transaction Hash</Text>
              <Text style={styles.statusHash} numberOfLines={1} ellipsizeMode="middle">
                {txHash}
              </Text>
            </View>
          )}

          {blockNumber && (
            <View style={styles.statusDetails}>
              <Text style={styles.statusLabel}>Block Number</Text>
              <Text style={styles.statusValue}>{blockNumber}</Text>
            </View>
          )}

          {status !== 'pending' && (
            <TouchableOpacity style={styles.statusButton} onPress={onClose}>
              <Text style={styles.statusButtonText}>
                {status === 'success' ? 'Done' : 'Close'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

// Helper Components
const GasRow = ({ label, value, highlight = false }) => (
  <View style={styles.gasRow}>
    <Text style={styles.gasLabel}>{label}</Text>
    <Text style={[styles.gasValue, highlight && styles.gasValueHighlight]}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  
  // Quick Modal Styles
  quickModal: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    ...SHADOWS.large,
  },
  quickTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  quickMessage: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
    lineHeight: 22,
  },
  quickError: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  quickErrorText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    textAlign: 'center',
  },
  quickButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  quickCancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  quickCancelText: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  quickConfirmButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  quickConfirmText: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.surface,
  },

  // Gas Modal Styles
  gasModal: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    ...SHADOWS.large,
  },
  gasTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  gasDetails: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  gasRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  gasLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  gasValue: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  gasValueHighlight: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  gasError: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  gasErrorTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.error,
    marginBottom: SPACING.sm,
  },
  gasErrorMessage: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  gasButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  gasCancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  gasCancelText: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  gasProceedButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  gasProceedText: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.surface,
  },

  // Status Modal Styles
  statusModal: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...SHADOWS.large,
  },
  statusIconContainer: {
    marginBottom: SPACING.lg,
  },
  statusIconSuccess: {
    fontSize: 64,
  },
  statusIconError: {
    fontSize: 64,
  },
  statusTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusDetails: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  statusLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
    marginBottom: 4,
  },
  statusHash: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    fontFamily: 'monospace',
  },
  statusValue: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text,
    fontWeight: '500',
  },
  statusButton: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
    ...SHADOWS.small,
  },
  statusButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.surface,
  },

  // Shared Styles
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  loadingText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default { QuickTransactionModal, GasEstimateModal, TransactionStatusModal };