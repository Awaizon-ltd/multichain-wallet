import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { useTheme } from '../../contexts/ThemeContext';


const SwapScreen = ({ navigation }) => {
  const { COLORS, SPACING, FONTS } = useTheme();

  const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
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
  },
  comingSoonCard: {
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  comingSoonEmoji: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  comingSoonTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  comingSoonText: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  featureCard: {
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  featureTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  featureList: {
    gap: SPACING.sm,
  },
  featureItem: {
    fontSize: FONTS.sizes.md,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
});


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Swap</Text>
        <Text style={styles.subtitle}>Exchange tokens instantly</Text>
      </View>

      <Card style={styles.comingSoonCard}>
        <Text style={styles.comingSoonEmoji}>🔄</Text>
        <Text style={styles.comingSoonTitle}>Coming Soon</Text>
        <Text style={styles.comingSoonText}>
          Token swapping feature will be available soon. You'll be able to exchange tokens directly within the app.
        </Text>
      </Card>

      <Card style={styles.featureCard}>
        <Text style={styles.featureTitle}>Planned Features:</Text>
        <View style={styles.featureList}>
          <Text style={styles.featureItem}>✓ DEX integration (Uniswap, PancakeSwap)</Text>
          <Text style={styles.featureItem}>✓ Best price routing</Text>
          <Text style={styles.featureItem}>✓ Slippage protection</Text>
          <Text style={styles.featureItem}>✓ Gas optimization</Text>
          <Text style={styles.featureItem}>✓ Price charts</Text>
        </View>
      </Card>

      <Button
        title="Go to Home"
        onPress={() => navigation.navigate('HomeTab')}
        variant="primary"
        fullWidth
      />
    </ScrollView>
  );
};



export default SwapScreen;