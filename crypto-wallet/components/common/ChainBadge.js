// components/common/ChainBadge.js
// Small chain-logo badge overlaid on the bottom-left corner of a token icon —
// lets you tell at a glance which chain an ERC-20 token belongs to. Used
// consistently across the Home assets list, Manage Tokens, Import Token, and
// the Swap/Send token pickers. The wrapping element must have
// `position: "relative"` (all consumers already do, since they also anchor
// other absolutely-positioned badges the same way).
import React from "react";
import { View, Image, StyleSheet } from "react-native";

const ChainBadge = ({ uri, size = 16, borderColor = "#fff" }) => {
  if (!uri) return null;
  const inner = size - 3;
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor,
        },
      ]}
    >
      <Image
        source={{ uri }}
        style={{ width: inner, height: inner, borderRadius: inner / 2 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: -3,
    left: -3,
    borderWidth: 1.5,
    overflow: "hidden",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default ChainBadge;
