import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWallet } from '../../contexts/WalletContext';
import { useLoading } from '../../contexts/LoadingContext';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Card from '../../components/common/Card';
import { useTheme } from '../../contexts/ThemeContext';


const UnlockWalletScreen = ({ navigation }) => {
  const { unlockWalletFromFirestore, loading } = useWallet();
  const { showLoading, updateLoading, hideLoading } = useLoading();
  const { COLORS, SPACING, FONTS } = useTheme();

  const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SPACING.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  form: {
    marginBottom: SPACING.xl,
  },
  unlockButton: {
    marginTop: SPACING.md,
  },
  helpSection: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
  },
  helpTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  helpText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  footerText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textTertiary,
  },
});

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleUnlock = async () => {
    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      setError('');
      
      // Step 1/4: Fetching wallet
      showLoading('Fetching your wallet...', { step: 1, totalSteps: 4 });
      
      // Small delay to show loading
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 2/4: Decrypting
      updateLoading('Decrypting wallet data...', 2);
      
      const decrypted = await unlockWalletFromFirestore(password);
      
      // Step 3/4: Verifying
      updateLoading('Verifying wallet...', 3);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 4/4: Complete
      updateLoading('Almost done...', 4);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      hideLoading();
      
      // Wallet unlocked successfully!
      // Navigation will automatically route to PasscodeSetupScreen
      // because needsPasscodeSetup is now true in WalletContext
      
    } catch (err) {
      console.error('Error unlocking wallet:', err);
      hideLoading();
      setError('Invalid password. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed" size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Unlock Your Wallet</Text>
          <Text style={styles.subtitle}>
            Enter your account password to restore your wallet
          </Text>
        </View>

        <Card style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={24} color={COLORS.primary} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Wallet Found</Text>
            <Text style={styles.infoText}>
              We found your encrypted wallet in the cloud. Enter your account password to decrypt and restore it.
            </Text>
          </View>
        </Card>

        <View style={styles.form}>
          <Input
            label="Account Password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError('');
            }}
            placeholder="Enter your password"
            secureTextEntry
            error={error}
            leftIcon={<Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} />}
            editable={!loading}
          />

          <Button
            title="Unlock Wallet"
            onPress={handleUnlock}
            loading={loading}
            disabled={loading || !password}
            fullWidth
            style={styles.unlockButton}
          />
        </View>

        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Need Help?</Text>
          <Text style={styles.helpText}>
            • Use the same password as your account{'\n'}
            • Your wallet is encrypted for security{'\n'}
            • Your recovery phrase is stored encrypted
          </Text>
        </View>

        <View style={styles.footer}>
          <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.textTertiary} />
          <Text style={styles.footerText}>
            Your wallet data is encrypted and secure
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};



export default UnlockWalletScreen;