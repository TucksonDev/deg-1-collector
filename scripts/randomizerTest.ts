/**
 * Script to test out the probabilities of minting each token type
 * Note: This was used when trying to come up with a good random function
 */
import { ethers } from "hardhat";
import { Contract } from "ethers";

// Constants
const PUBLIC_SALE_STATUS = 2;
const MAX_SUPPLY = 999;
const MINT_PRICE = 0.01;
const MAX_MINT_AMOUNT = 3;

// Variables
let contract: Contract;
let walletBalance = [0, 0, 0, 0, 0, 0];

// Helper functions
function subtractArrays(arr1: Array<number>, arr2: Array<number>) {
    return arr2.map((elem, i) => {
        return elem - arr1[i];
    });
}

async function deploy() {
    const contractFactory = await ethers.getContractFactory("DeGCollector");
    contract = await contractFactory.deploy();
    await contract.deployed();
    console.log(`Contract deployed to ${contract.address}`);

    await contract.setSaleState(PUBLIC_SALE_STATUS);
    console.log(`Contract sale state updated to PUBLIC`);
}

async function mint(amount: number) {
    // Minting one set of tokens
    const mintPrice = ethers.utils.parseEther(String(MINT_PRICE * amount));
    await contract.publicMint(amount, { value: mintPrice });

    // Calculating what tokens were minted
    const newWalletBalance = await contract.tokenTypeSupply();
    const mintedTokens = subtractArrays(walletBalance, newWalletBalance);

    // Updating balance
    walletBalance = newWalletBalance;

    console.log("Minted tokens are", mintedTokens);
}

async function main() {
    await deploy();

    // Minting all tokens
    let currentSupply = 0;
    while (currentSupply + MAX_MINT_AMOUNT < MAX_SUPPLY) {
        await mint(MAX_MINT_AMOUNT);
        currentSupply = (await contract.totalSupply()).toNumber();
    }
    // Last iteration in case there are tokens left
    if (currentSupply < MAX_SUPPLY) {
        await mint(MAX_SUPPLY - currentSupply);
        currentSupply = (await contract.totalSupply()).toNumber();
    }

    // Showing final token type balances
    const tokenTypeSupply = await contract.tokenTypeSupply();
    console.log("Final Token Type Supply", tokenTypeSupply);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
