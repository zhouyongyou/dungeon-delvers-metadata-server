# V19 Contract Addresses

## Deployment Date: 2025-07-24

### Core NFT Contracts
```
Hero: 0x141F081922D4015b3157cdA6eE970dff34bb8AAb
Relic: 0xB1eb505426e852B8Dca4BF41454a7A22D2B6F3D3
Party: 0xf240c4fD2651Ba41ff09eB26eE01b21f42dD9957
```

### Game Contracts
```
DungeonMaster: 0xd34ddc336071FE7Da3c636C3Df7C3BCB77B1044a
VIPStaking: 0x43A6C6cC9D15f2C68C7ec98deb01f2b69a618470
PlayerProfile: 0x1d36C2F3f0C9212422B94608cAA72080CBf34A41
AltarOfAscension: 0xb53c51Dc426c2Bd29da78Ac99426c55A6D6a51Ab
```

### Infrastructure Contracts
```
Oracle: 0x54Ff2524C996d7608CaE9F3D9dd2075A023472E9
DungeonCore: 0x4D353aFC420E6187bfA5F99f0DdD8F7F137c20E9
PlayerVault: 0xF68cEa7E171A5caF151A85D7BEb2E862B83Ccf78
DungeonStorage: 0x6B85882ab32471Ce4a6599A7256E50B8Fb1fD43e
```

### Token Contracts (Unchanged from V18)
```
SoulShard: 0x97B2C2a9A11C7b6A020b4bAEaAd349865eaD0bcF
TestUSD: 0xa095B8c9D9964F62A7dbA3f60AA91dB381A3e074
```

### Wallet Address (Unchanged)
```
DungeonMasterWallet: 0x10925A7138649C7E1794CE646182eeb5BF8ba647
```

## Configuration Update Checklist

### Backend (metadata-server)
- [ ] Update `.env` file with V19 addresses
- [ ] Update `CONFIG_URL` to point to v19.json
- [ ] Test all API endpoints locally
- [ ] Deploy to Render

### Frontend
- [ ] Create `/public/config/v19.json` with new addresses
- [ ] Update environment variables if needed
- [ ] Deploy to production

### Subgraph
- [ ] Update `subgraph.yaml` with V19 addresses
- [ ] Update start block numbers
- [ ] Redeploy subgraph

## Verification Steps

1. Check contract addresses:
   ```bash
   curl https://dungeon-delvers-metadata-server.onrender.com/api/contracts
   ```

2. Test NFT metadata:
   ```bash
   curl https://dungeon-delvers-metadata-server.onrender.com/api/hero/1
   curl https://dungeon-delvers-metadata-server.onrender.com/api/relic/1
   curl https://dungeon-delvers-metadata-server.onrender.com/api/party/1
   ```

3. Verify config loading:
   ```bash
   curl https://dungeondelvers.xyz/config/v19.json
   ```