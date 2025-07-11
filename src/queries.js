// queries.js - 統一的GraphQL查詢定義
// 確保與前端查詢結構保持一致

import { gql } from 'graphql-request';

// 單個NFT實體查詢 - 用於metadata API
export const GET_HERO_QUERY = gql`
  query GetHero($id: ID!) {
    hero(id: $id) {
      id
      tokenId
      power
      rarity
      contractAddress
      createdAt
      owner {
        id
      }
    }
  }
`;

export const GET_RELIC_QUERY = gql`
  query GetRelic($id: ID!) {
    relic(id: $id) {
      id
      tokenId
      capacity
      rarity
      contractAddress
      createdAt
      owner {
        id
      }
    }
  }
`;

export const GET_PARTY_QUERY = gql`
  query GetParty($id: ID!) {
    party(id: $id) {
      id
      tokenId
      totalPower
      totalCapacity
      partyRarity
      contractAddress
      heros {
        tokenId
        power
        rarity
      }
      relics {
        tokenId
        capacity
        rarity
      }
      fatigueLevel
      provisionsRemaining
      cooldownEndsAt
      unclaimedRewards
      createdAt
      owner {
        id
      }
    }
  }
`;

export const GET_PLAYER_PROFILE_QUERY = gql`
  query GetPlayerProfile($playerId: ID!) {
    player(id: $playerId) {
      id
      profile {
        id
        tokenId
        experience
        level
      }
    }
  }
`;

export const GET_VIP_QUERY = gql`
  query GetVIP($playerId: ID!) {
    player(id: $playerId) {
      id
      vip {
        id
        tokenId
        stakedAmount
        level
      }
    }
  }
`;

// 完整玩家資產查詢 - 與前端保持一致
export const GET_PLAYER_ASSETS_QUERY = gql`
  query GetPlayerAssets($owner: ID!) {
    player(id: $owner) {
      id
      heros { 
        id 
        tokenId 
        power 
        rarity 
        contractAddress
        createdAt
      }
      relics { 
        id 
        tokenId 
        capacity 
        rarity 
        contractAddress
        createdAt
      }
      parties {
        id
        tokenId
        totalPower
        totalCapacity
        partyRarity
        contractAddress
        heros { tokenId }
        relics { tokenId }
        fatigueLevel
        provisionsRemaining
        cooldownEndsAt
        unclaimedRewards
        createdAt
      }
      vip { 
        id 
        tokenId 
        stakedAmount 
        level 
      }
      profile {
        id
        tokenId
        experience
        level
      }
    }
  }
`;

// 統計查詢
export const GET_GLOBAL_STATS_QUERY = gql`
  query GetGlobalStats {
    globalStats(id: "global") {
      id
      totalHeroes
      totalRelics
      totalParties
      totalPlayers
      totalUpgradeAttempts
      successfulUpgrades
      lastUpdated
    }
  }
`;

export const GET_PLAYER_STATS_QUERY = gql`
  query GetPlayerStats($playerId: ID!) {
    playerStats(id: $playerId) {
      id
      totalHeroesMinted
      totalRelicsMinted
      totalPartiesCreated
      totalExpeditions
      successfulExpeditions
      totalRewardsEarned
      highestPartyPower
      totalUpgradeAttempts
      successfulUpgrades
      lastActivityAt
    }
  }
`;