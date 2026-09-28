// components/market/CoinLogo.js — round token logo with a letter fallback
// and an optional chain badge in the bottom-right corner.
import React, { memo, useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";

const CoinLogo = ({ uri, symbol, size = 40, badgeUri }) => {
  const { COLORS } = useTheme();
  const [failed, setFailed] = useState(false);
  const badge = Math.round(size * 0.42);

  return (
    <View style={{ width: size, height: size }}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          fadeDuration={0}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: COLORS.surface,
          }}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: COLORS.primaryMuted,
            },
          ]}
        >
          <Text
            style={{ fontSize: size * 0.4, fontWeight: "800", color: COLORS.text }}
          >
            {symbol?.charAt(0)?.toUpperCase() ?? "?"}
          </Text>
        </View>
      )}
      {badgeUri ? (
        <Image
          source={{ uri: badgeUri }}
          style={[
            styles.badge,
            {
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              borderColor: COLORS.background,
            },
          ]}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", right: -2, bottom: -2, borderWidth: 2 },
});

export default memo(CoinLogo);
