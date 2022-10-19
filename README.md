# Game 1 - Collector
Fully onchain game about collecting different types of NFTs

# Game logic
There are 6 different types of NFTs within the smartcontract. Types have different supplies available to make them have different rarities. The goal of the game is to collect one NFT of each type to be able to claim a prize. 3 prizes are available, each one after enough funds have been collected.

# Technical specifications
- OpenZeppelin implementation of the ERC-721 standard is used as the base for the smartcontract.
- On top of that, a TokenType layer is added, where each NFT has one random type.
- To attain randomness, a set of onchain values is used. Preferrably a full random oracle should be called. However, given the simplicity of the game, and the short minting timeframe it's supposed to have, a more simple approach is followed.
- The team is aware, miners can try to guess specific block timestamps and hashes, leading to a weak random generator. Again, this is supposed to have a short minting period, lowering the risk of manipulating the generator.
- All scripts are written in Typescript. Support libraries for Typescript are already in package.json

# Disabled rules on Solhint and Slither
- "not-rely-on-time" rule is disabled when generating a random number for the reasons described above: this game is supposed to have a short minting period, lowering thus the risk of manipulating the generator.

# CLI instructions
- `npm install` : To install all dependencies
- `npx hardhat compile` : To compile the contract
- `npx hardhat test ./tests/DeGCollector.ts` : To run the tests
- `npx hardhat run ./scripts/deploy.ts --network [goerli|mainnet]` : To run the deploy script
- `npx hardhat verify <ContractAddress> --network [goerli|mainnet]` : To initiate the verification process for Etherscan

# Dependencies
- Libraries are specified in package.json
- Hardhat is used to compile, test and run scripts: https://hardhat.org/
- Alchemy is used for configuring the ETH node to go through: https://www.alchemy.com/

# TODO
Some tasks are still pending to be finalized:
- Change the withdraw function, so it leaves so balance in  the contract when claiming is still possible. Also, add some mechanism to be able to withdraw all funds after a period of time, in case the game does not finish.
- Analyze the contract using Slither