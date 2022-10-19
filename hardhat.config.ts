import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// Load dotenv configuration
import * as dotenv from 'dotenv'
dotenv.config();

// Import tasks
import { showMerkleTree } from "./tasks/generateMerkleTree";
import checkWlAddress from "./tasks/checkWlAddress";
import getWhitelistProof from "./tasks/getWhitelistProof";

// Creating tasks
task("get-whitelist-proof", "Gets the proof of a whitelisted address")
    .addParam("address", "Address to get the proof for")
    .setAction(async(taskArgs) => { getWhitelistProof(taskArgs.address); });

task("check-wl-address", "Checks whether an address is Whitelisted")
    .addParam("proof", "Proof to validate against in base64")
    .addParam("address", "Address to verify")
    .addParam("mtroot", "Root of the merkle tree")
    .setAction(async(taskArgs) => { checkWlAddress(taskArgs.proof, taskArgs.address, taskArgs.mtroot); });

task("generate-merkle-tree", "Generates Merkle Tree from addresses present in /data/wlAddresses")
    .setAction(async() => { showMerkleTree(); });

const config: HardhatUserConfig = {
    // Etherscan keys
    etherscan: {
        apiKey: {
            rinkeby: process.env.ETHERSCAN_RINKEBY_API_KEY as string,
            mainnet: process.env.ETHERSCAN_MAINNET_API_KEY as string,
        }
    },

    // Nodes
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
        },
        ganache: {
            url: process.env.LOCAL_RPC,
            accounts: [
                process.env.LOCAL_PRIVATE_KEY_0 as string,
                process.env.LOCAL_PRIVATE_KEY_1 as string,
                process.env.LOCAL_PRIVATE_KEY_2 as string,
                process.env.LOCAL_PRIVATE_KEY_3 as string,
                process.env.LOCAL_PRIVATE_KEY_4 as string,
                process.env.LOCAL_PRIVATE_KEY_5 as string,
                process.env.LOCAL_PRIVATE_KEY_6 as string,
                process.env.LOCAL_PRIVATE_KEY_7 as string,
                process.env.LOCAL_PRIVATE_KEY_8 as string,
                process.env.LOCAL_PRIVATE_KEY_9 as string,
            ]
        },
        rinkeby: {
            url: "https://eth-rinkeby.alchemyapi.io/v2/" + process.env.ALCHEMY_RINKEBY_KEY,
            accounts: [process.env.RINKEBY_PRIVATE_KEY as string],

            // Use these if network is volatile and want to make sure your txn goes through
            // https://hardhat.org/config/
            // gas, gasPrice, ... are measured in "wei" (without 'g')
            gasPrice: 5000000000, // 5 gwei
        },
        mainnet: {
            url: "https://eth-mainnet.alchemyapi.io/v2/" + process.env.ALCHEMY_MAINNET_KEY,
            accounts: [process.env.MAINNET_PRIVATE_KEY as string],

            // Use these if network is volatile and want to make sure your txn goes through
            // https://hardhat.org/config/
            // gas, gasPrice, ... are measured in "wei" (without 'g')
            gasPrice: 25000000000,  // 25 gwei
        },
    },

    // Compiler options
    solidity: {
        version: "0.8.9",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },

    // Gas reporter
    gasReporter: {
        gasPrice: 20
    }
};

export default config;
