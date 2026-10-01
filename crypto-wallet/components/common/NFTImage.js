// components/common/NFTImage.js
// Renders an NFT's image, falling back to the local placeholder both when
// there's no resolvable URL at all and when the remote URL fails to load
// (common for manually-discovered NFTs pointing at slow/dead IPFS gateways).
import React, { useState } from "react";
import { Image } from "react-native";
import { getNFTImageUrl, NFT_PLACEHOLDER_IMAGE } from "../../utils/blockchain/nftImage";

const NFTImage = ({ nft, style, resizeMode = "cover" }) => {
  const [failed, setFailed] = useState(false);
  const url = getNFTImageUrl(nft);

  const source =
    !url || failed ? NFT_PLACEHOLDER_IMAGE : { uri: url };

  return (
    <Image
      source={source}
      style={style}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
};

export default NFTImage;
