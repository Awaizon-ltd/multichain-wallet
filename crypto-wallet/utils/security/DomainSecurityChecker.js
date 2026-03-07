/**
 * DomainSecurityChecker - Intelligent domain security and spam detection
 */
export class DomainSecurityChecker {
  constructor() {
    // Known legitimate domains
    this.legitimateDomains = new Map([
      ["uniswap.org", { verified: true, category: "DEX" }],
      ["app.uniswap.org", { verified: true, category: "DEX" }],
      ["pancakeswap.finance", { verified: true, category: "DEX" }],
      ["app.aave.com", { verified: true, category: "Lending" }],
      ["aave.com", { verified: true, category: "Lending" }],
      ["curve.fi", { verified: true, category: "DEX" }],
      ["opensea.io", { verified: true, category: "NFT" }],
      ["blur.io", { verified: true, category: "NFT" }],
      ["magiceden.io", { verified: true, category: "NFT" }],
      ["app.1inch.io", { verified: true, category: "DEX" }],
      ["sushi.com", { verified: true, category: "DEX" }],
      ["app.compound.finance", { verified: true, category: "Lending" }],
      ["compound.finance", { verified: true, category: "Lending" }],
      ["lido.fi", { verified: true, category: "Staking" }],
      ["coingecko.com", { verified: true, category: "Analytics" }],
      ["coinmarketcap.com", { verified: true, category: "Analytics" }],
      ["defillama.com", { verified: true, category: "Analytics" }],
      ["etherscan.io", { verified: true, category: "Explorer" }],
      ["bscscan.com", { verified: true, category: "Explorer" }],
      ["polygonscan.com", { verified: true, category: "Explorer" }],
      ["arbiscan.io", { verified: true, category: "Explorer" }],
      ["optimistic.etherscan.io", { verified: true, category: "Explorer" }],
      ["pinksale.finance", { verified: true, category: "Launchpad" }],
      // Mantle Ecosystem
      ["refuel.mantle.xyz", { verified: true, category: "Gas Refuel" }],
      ["app.mantle.xyz", { verified: true, category: "Bridge" }],
      ["mantle.xyz", { verified: true, category: "Official" }],
      ["merchantmoe.com", { verified: true, category: "DEX" }],
      ["minter.merkly.com", { verified: true, category: "Gas Refuel" }],
      ["merkly.com", { verified: true, category: "Cross-chain" }],
      ["explorer.mantle.xyz", { verified: true, category: "Explorer" }],
    ]);

    // Known malicious patterns
    this.maliciousPatterns = [
      /pancake-swap/i,
      /uniswap-app/i,
      /uni-swap/i,
      /opensee/i,
      /metama5k/i,
      /metamusk/i,
      /pink-sale/i,
      /pinksaIe/i, // capital i instead of l
      /airdrop-claim/i,
      /claim-tokens/i,
      /free-nft/i,
      /eth-giveaway/i,
      /connect-wallet-verify/i,
      /validate-wallet/i,
    ];

    // Suspicious TLDs
    this.suspiciousTLDs = [
      ".xyz",
      ".tk",
      ".ml",
      ".ga",
      ".cf",
      ".gq",
      ".top",
      ".click",
      ".link",
      ".work",
      ".icu",
    ];

    // Typosquatting detection for popular domains
    this.popularDomains = [
      "uniswap",
      "pancakeswap",
      "opensea",
      "metamask",
      "aave",
      "curve",
      "sushi",
      "compound",
      "pinksale",
      "blur",
      "lido",
      "mantle",
      "merchantmoe",
      "merkly",
    ];
  }

  /**
   * Main security check method
   */
  async checkDomain(domain) {
    const warnings = [];
    let isHighRisk = false;
    let score = 0; // Risk score (higher = more risky)

    // 1. Check if domain is in legitimate list
    if (this.legitimateDomains.has(domain)) {
      return {
        isLegitimate: true,
        isHighRisk: false,
        warnings: [],
        score: 0,
        category: this.legitimateDomains.get(domain).category,
      };
    }

    // 2. Check for exact malicious patterns
    for (const pattern of this.maliciousPatterns) {
      if (pattern.test(domain)) {
        isHighRisk = true;
        score += 100;
        warnings.push("⛔ This domain matches known phishing patterns");
        break;
      }
    }

    // 3. Check for typosquatting
    const typoResult = this.checkTyposquatting(domain);
    if (typoResult.isTyposquatting) {
      isHighRisk = true;
      score += 80;
      warnings.push(
        `⚠️ Possible fake site! Similar to legitimate domain: ${typoResult.similarTo}`,
      );
    }

    // 4. Check for suspicious characters
    if (this.hasSuspiciousCharacters(domain)) {
      score += 50;
      warnings.push("⚠️ Domain contains suspicious characters (homoglyphs)");
    }

    // 5. Check TLD
    const tld = this.extractTLD(domain);
    if (this.suspiciousTLDs.includes(tld)) {
      score += 30;
      warnings.push(
        `⚠️ Unusual domain extension (${tld}) - often used for phishing`,
      );
    }

    // 6. Check for excessive subdomains
    const subdomainCount = domain.split(".").length - 2;
    if (subdomainCount > 2) {
      score += 20;
      warnings.push("⚠️ Excessive subdomains detected - may be suspicious");
    }

    // 7. Check for IP address instead of domain
    if (this.isIPAddress(domain)) {
      score += 40;
      warnings.push("⚠️ Using IP address instead of domain name");
    }

    // 8. Check domain age indicators (length, patterns)
    if (this.hasNewDomainIndicators(domain)) {
      score += 15;
      warnings.push("ℹ️ Domain appears recently registered");
    }

    // 9. Check for common scam keywords
    const scamKeywords = [
      "airdrop",
      "claim",
      "free",
      "giveaway",
      "bonus",
      "verify",
      "validate",
      "confirm",
      "urgent",
      "limited",
    ];

    for (const keyword of scamKeywords) {
      if (domain.toLowerCase().includes(keyword)) {
        score += 25;
        warnings.push(`⚠️ Contains suspicious keyword: "${keyword}"`);
        break;
      }
    }

    // 10. Check for mixed scripts (e.g., Cyrillic + Latin)
    if (this.hasMixedScripts(domain)) {
      isHighRisk = true;
      score += 70;
      warnings.push(
        "⛔ Domain uses mixed character sets - likely phishing attempt",
      );
    }

    // Determine risk level
    if (score >= 70) {
      isHighRisk = true;
    }

    return {
      isLegitimate: false,
      isHighRisk,
      warnings,
      score,
      riskLevel: this.getRiskLevel(score),
    };
  }

  /**
   * Check for typosquatting against popular domains
   */
  checkTyposquatting(domain) {
    const cleanDomain = domain.toLowerCase().split(".")[0];

    for (const popular of this.popularDomains) {
      // Check Levenshtein distance
      const distance = this.levenshteinDistance(cleanDomain, popular);

      // If distance is 1-2, likely typosquatting
      if (distance > 0 && distance <= 2) {
        return {
          isTyposquatting: true,
          similarTo: popular,
          distance,
        };
      }

      // Check for character substitution
      if (this.hasCharacterSubstitution(cleanDomain, popular)) {
        return {
          isTyposquatting: true,
          similarTo: popular,
          type: "substitution",
        };
      }

      // Check for added characters (e.g., uniswap-app)
      if (
        cleanDomain.includes(popular) &&
        cleanDomain !== popular &&
        cleanDomain.length < popular.length + 5
      ) {
        return {
          isTyposquatting: true,
          similarTo: popular,
          type: "addition",
        };
      }
    }

    return { isTyposquatting: false };
  }

  /**
   * Check for character substitution (e.g., l -> 1, o -> 0)
   */
  hasCharacterSubstitution(domain, legitimate) {
    const substitutions = {
      l: ["1", "i", "I"],
      o: ["0"],
      e: ["3"],
      a: ["4", "@"],
      s: ["5", "$"],
      g: ["9"],
      i: ["1", "l"],
    };

    let variations = [legitimate];

    for (const [char, replacements] of Object.entries(substitutions)) {
      const newVariations = [];
      for (const variation of variations) {
        for (const replacement of replacements) {
          newVariations.push(variation.replace(char, replacement));
        }
      }
      variations = [...variations, ...newVariations];
    }

    return variations.includes(domain);
  }

  /**
   * Check for suspicious characters (homoglyphs)
   */
  hasSuspiciousCharacters(domain) {
    // Check for Cyrillic characters that look like Latin
    const homoglyphs = /[а-яА-ЯёЁ]/; // Cyrillic
    return homoglyphs.test(domain);
  }

  /**
   * Check for mixed character scripts
   */
  hasMixedScripts(domain) {
    const hasCyrillic = /[а-яА-ЯёЁ]/.test(domain);
    const hasLatin = /[a-zA-Z]/.test(domain);
    return hasCyrillic && hasLatin;
  }

  /**
   * Check if domain is an IP address
   */
  isIPAddress(domain) {
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Pattern.test(domain) || ipv6Pattern.test(domain);
  }

  /**
   * Check for indicators of new/temporary domains
   */
  hasNewDomainIndicators(domain) {
    // Very long random-looking strings
    const parts = domain.split(".");
    const mainDomain = parts[0];

    // Check for excessive length
    if (mainDomain.length > 20) {
      return true;
    }

    // Check for random character patterns
    const randomPattern = /([a-z]{1,2}\d{3,}|\d{3,}[a-z]{1,2})/i;
    if (randomPattern.test(mainDomain)) {
      return true;
    }

    return false;
  }

  /**
   * Extract TLD from domain
   */
  extractTLD(domain) {
    const parts = domain.split(".");
    return parts.length > 1 ? "." + parts[parts.length - 1] : "";
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get risk level description
   */
  getRiskLevel(score) {
    if (score >= 70) return "High Risk";
    if (score >= 40) return "Medium Risk";
    if (score >= 20) return "Low Risk";
    return "Minimal Risk";
  }

  /**
   * Add domain to legitimate list (for user-trusted domains)
   */
  addTrustedDomain(domain, category = "User-Added") {
    this.legitimateDomains.set(domain, {
      verified: true,
      category,
      userAdded: true,
    });
  }

  /**
   * Remove domain from trusted list
   */
  removeTrustedDomain(domain) {
    if (
      this.legitimateDomains.has(domain) &&
      this.legitimateDomains.get(domain).userAdded
    ) {
      this.legitimateDomains.delete(domain);
      return true;
    }
    return false;
  }
}
