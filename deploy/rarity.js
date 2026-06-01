/**
 * computeRarity — OpenRarity-compatible information-content scoring.
 *
 * @param {Array}  nfts            - NFT objects with .identifier and .traits []
 * @param {Object} traitCategories - OpenSea /traits response: { categories: { Type: { value: count } } }
 * @param {number} totalSupply     - Total tokens in the collection
 * @returns {Map}  Map<tokenId(string), { score: number, rank: number, percentile: number }>
 */
function computeRarity(nfts, traitCategories, totalSupply) {
  if (!totalSupply || totalSupply === 0) {
    console.warn('[rarity] totalSupply is 0, returning empty Map');
    return new Map();
  }

  // OpenSea /traits response: { categories: { Type: "string" }, counts: { Type: { value: count } } }
  const categories = (traitCategories && traitCategories.counts) || {};

  // Build per-token trait maps, deduplicating by keeping first occurrence of each trait_type
  const tokenTraitMaps = new Map(); // tokenId → Map<trait_type, value>
  for (const nft of nfts) {
    const tokenId = String(nft.identifier);
    if (!tokenTraitMaps.has(tokenId)) {
      const traitMap = new Map();
      for (const t of (nft.traits || [])) {
        if (t.trait_type && !traitMap.has(t.trait_type)) {
          traitMap.set(t.trait_type, t.value);
        }
      }
      tokenTraitMaps.set(tokenId, traitMap);
    }
  }

  if (!categories || Object.keys(categories).length === 0) {
    const result = new Map();
    for (const [tokenId] of tokenTraitMaps) {
      result.set(tokenId, { score: 0, rank: 1, percentile: (1 / totalSupply) * 100 });
    }
    return result;
  }

  // Trait count distribution for trait-count IC pseudo-category
  const traitCountDist = new Map(); // count → number of tokens with that count
  for (const [, traitMap] of tokenTraitMaps) {
    const c = traitMap.size;
    traitCountDist.set(c, (traitCountDist.get(c) || 0) + 1);
  }

  // Score each token
  const tokenScores = [];
  for (const [tokenId, traitMap] of tokenTraitMaps) {
    let score = 0;

    for (const [catName, valueCounts] of Object.entries(categories)) {
      const tokenValue = traitMap.get(catName);

      if (tokenValue !== undefined) {
        const count = valueCounts[tokenValue];
        if (count == null) continue; // stale metadata — skip without crashing
        score += -Math.log2(count / totalSupply);
      } else {
        // Null trait: token is missing this category
        const presentCount = Object.values(valueCounts).reduce((s, c) => s + c, 0);
        const nullCount = totalSupply - presentCount;
        if (nullCount > 0) {
          score += -Math.log2(nullCount / totalSupply);
        }
      }
    }

    // Trait count IC
    const tc = traitMap.size;
    const tcFreq = traitCountDist.get(tc) || 1;
    score += -Math.log2(tcFreq / totalSupply);

    tokenScores.push({ tokenId, score });
  }

  // Dense ranking: tied scores share a rank; next rank increments by 1 (not by tie count)
  const sorted = [...tokenScores].sort((a, b) => b.score - a.score);
  const result = new Map();
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].score !== sorted[i - 1].score) rank++;
    result.set(sorted[i].tokenId, {
      score:      sorted[i].score,
      rank,
      percentile: (rank / totalSupply) * 100,
    });
  }

  return result;
}

// Smoke test — only runs in Node, not in the browser
if (typeof window === 'undefined') {
  const mockNfts = [
    { identifier: '1', traits: [{ trait_type: 'Background', value: 'Blue' }, { trait_type: 'Eyes', value: 'Laser'  }] },
    { identifier: '2', traits: [{ trait_type: 'Background', value: 'Blue' }, { trait_type: 'Eyes', value: 'Normal' }] },
    { identifier: '3', traits: [{ trait_type: 'Background', value: 'Red'  }, { trait_type: 'Eyes', value: 'Normal' }] },
  ];
  const mockCategories = {
    counts: {
      Background: { Blue: 2, Red: 1 },
      Eyes:       { Laser: 1, Normal: 2 },
    },
  };
  const result = computeRarity(mockNfts, mockCategories, 3);
  console.assert(result.get('1').rank === 1, 'Token 1 should be rank 1');
  console.assert(result.get('3').rank === 1, 'Token 3 should be rank 1 (tied)');
  console.assert(result.get('2').rank === 2, 'Token 2 should be rank 2 (dense ranking, not 3)');
  console.log('computeRarity smoke test passed');
}
