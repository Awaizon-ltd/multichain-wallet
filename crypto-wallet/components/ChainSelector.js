// components/ChainSelector.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext'; // Adjust path as needed
import { useChain } from '../contexts/ChainContext';
import { isFactoryDeployed } from '../constants/ContractAddress';

/**
 * Chain Selector Component
 * Allows users to switch between supported chains
 */
export const ChainSelector = ({ onChainChange, disabled = false }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { activeChain, getAllChains, switchChain } = useChain();
  const [modalVisible, setModalVisible] = useState(false);

  const handleChainSelect = async (chain) => {
    try {
      await switchChain(chain);
      setModalVisible(false);
      if (onChainChange) {
        onChainChange(chain);
      }
    } catch (error) {
      console.error('Error switching chain:', error);
    }
  };

  const allChains = getAllChains();
  const deployedChains = allChains.filter(chain => isFactoryDeployed(chain.id));

  return (
    <>
      {/* Chain Display Button */}
      <TouchableOpacity
        style={[styles.chainButton, disabled && styles.chainButtonDisabled]}
        onPress={() => setModalVisible(true)}
        disabled={disabled}
      >
        <View style={styles.chainInfo}>
          <Image 
            source={{ uri: activeChain.icon }} 
            style={styles.chainIcon}
          />
          <View style={styles.chainTextContainer}>
            <Text style={styles.chainLabel}>Network</Text>
            <Text style={styles.chainName}>{activeChain.name}</Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={20} color={theme.COLORS.textSecondary} />
      </TouchableOpacity>

      {/* Chain Selection Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Network</Text>
              <TouchableOpacity 
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={theme.COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Chain List */}
            <FlatList
              data={deployedChains}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <ChainItem
                  chain={item}
                  isActive={item.id === activeChain.id}
                  onSelect={handleChainSelect}
                  theme={theme}
                />
              )}
              contentContainerStyle={styles.chainList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="warning-outline" size={48} color={theme.COLORS.textSecondary} />
                  <Text style={styles.emptyText}>No chains available</Text>
                  <Text style={styles.emptySubtext}>
                    Please deploy the factory contract first
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

/**
 * Chain Item Component
 */
const ChainItem = ({ chain, isActive, onSelect, theme }) => {
  const styles = createStyles(theme);
  
  return (
    <TouchableOpacity
      style={[styles.chainItem, isActive && styles.chainItemActive]}
      onPress={() => onSelect(chain)}
    >
      <Image source={{ uri: chain.icon }} style={styles.chainItemIcon} />
      <View style={styles.chainItemInfo}>
        <Text style={styles.chainItemName}>{chain.name}</Text>
        <Text style={styles.chainItemSymbol}>{chain.symbol}</Text>
      </View>
      {isActive && (
        <View style={styles.activeIndicator}>
          <Ionicons name="checkmark-circle" size={24} color={theme.COLORS.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const createStyles = (theme) =>
  StyleSheet.create({
    chainButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.COLORS.surface,
      borderWidth: 1,
      borderColor: theme.COLORS.border,
      borderRadius: theme.BORDER_RADIUS.md,
      padding: theme.SPACING.md,
      ...theme.SHADOWS.small,
    },
    chainButtonDisabled: {
      opacity: 0.5,
    },
    chainInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    chainIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      marginRight: theme.SPACING.sm,
    },
    chainTextContainer: {
      flex: 1,
    },
    chainLabel: {
      fontSize: theme.FONTS.sizes.xs,
      color: theme.COLORS.textSecondary,
      marginBottom: 2,
    },
    chainName: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: '600',
      color: theme.COLORS.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: theme.COLORS.surface,
      borderTopLeftRadius: theme.BORDER_RADIUS.xl,
      borderTopRightRadius: theme.BORDER_RADIUS.xl,
      maxHeight: '70%',
      ...theme.SHADOWS.large,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.SPACING.lg,
      paddingVertical: theme.SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.COLORS.divider,
    },
    modalTitle: {
      fontSize: theme.FONTS.sizes.lg,
      fontWeight: 'bold',
      color: theme.COLORS.text,
    },
    closeButton: {
      padding: theme.SPACING.xs,
    },
    chainList: {
      padding: theme.SPACING.md,
    },
    chainItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.SPACING.md,
      backgroundColor: theme.COLORS.background,
      borderRadius: theme.BORDER_RADIUS.md,
      marginBottom: theme.SPACING.sm,
      borderWidth: 1,
      borderColor: theme.COLORS.divider,
    },
    chainItemActive: {
      borderColor: theme.COLORS.primary,
      backgroundColor: `${theme.COLORS.primary}10`,
    },
    chainItemIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: theme.SPACING.md,
    },
    chainItemInfo: {
      flex: 1,
    },
    chainItemName: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: '600',
      color: theme.COLORS.text,
      marginBottom: 2,
    },
    chainItemSymbol: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
    },
    activeIndicator: {
      marginLeft: theme.SPACING.sm,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: theme.SPACING.xl * 2,
    },
    emptyText: {
      fontSize: theme.FONTS.sizes.md,
      fontWeight: '600',
      color: theme.COLORS.text,
      marginTop: theme.SPACING.md,
    },
    emptySubtext: {
      fontSize: theme.FONTS.sizes.sm,
      color: theme.COLORS.textSecondary,
      marginTop: theme.SPACING.xs,
      textAlign: 'center',
      paddingHorizontal: theme.SPACING.xl,
    },
  });

export default ChainSelector;