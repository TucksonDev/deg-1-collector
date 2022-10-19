// Libraries
import { ethers } from "hardhat";
import chai from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MerkleTree } from "merkletreejs";
import { generateMerkleTreeFromAddressList } from "../tasks/generateMerkleTree";
import { getWhitelistHexProof } from "../tasks/getWhitelistProof";

// Library constants
const expect = chai.expect;

////////////////////
// Test Constants //
////////////////////
const CONTRACT_NAME = "DeGCollector";
const TOKEN_NAME = "DeGCollector";
const TOKEN_SYMBOL = "DEGCOLL";
const TOKEN_RESOURCE_URI = "ipfs://QmY73kCnAqXooQbK5kUpk2jBF1JvWPBBSR6whRaNMoTsj7";

// Tokenomics
const MAX_SUPPLY = 999;
const TOKEN_TYPE_MAX_SUPPLY = [590, 200, 200, 3, 3, 3];
const MINT_PRICE = 0.01;
const MAX_MINT_AMOUNT = 3;
const TEST_MINT_AMOUNT = 2;
const TEST_MINT_VALUE = ethers.utils.parseEther(String(MINT_PRICE * TEST_MINT_AMOUNT));

// Other contract constants
const SALE_OFF_STATUS = 0;
const PRIVATE_SALE_STATUS = 1;
const PUBLIC_SALE_STATUS = 2;

// Custom errors
const WRONG_AMOUNT_ERROR = "Amount must be between 1 and " + MAX_MINT_AMOUNT;
const NO_SUPPLY_LEFT_ERROR = "No supply available to mint that amount";
const WRONG_PRICE_ERROR = "Price must be .01 eth per token";
const SALE_PRIVATE_NOT_ACTIVE_ERROR = "Presale is not active";
const SALE_PUBLIC_NOT_ACTIVE_ERROR = "Public sale is not active";
const ADDRESS_NOT_WHITELISTED_ERROR = "Address is not whitelisted";
const ALL_PRIZES_CLAIMED_ERROR = "All prizes have been claimed";
const WALLET_CANT_CLAIM_NEW_PRICE_ERROR = "Wallet has already claimed a prize";
const TOKEN_USED_TO_CLAIM_PRIZE_BEFORE_ERROR = "One of the tokens has been used to claim another prize";
const TWO_TOKENS_OF_SAME_TYPE_ERROR = "Can't use two tokens of the same type";
const CLAIMER_NOT_OWNER_ERROR = "Can't claim prize if you don't own the token";
const NOT_MINTED_TOKEN_ERROR = "One token has not been minted yet";

///////////
// TESTS //
///////////
describe("DeGCollector tests", function () {
    // Test vars
    let contractFactory: ContractFactory;
    let contract: Contract;
    let owner: SignerWithAddress;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress;
    let addr3: SignerWithAddress; // Not whitelisted
    let addr4: SignerWithAddress; // Not whitelisted
    let addrs: SignerWithAddress[];
    let merkleTree: MerkleTree;
    let addr1Proof: string[];
    let addr2Proof: string[];

    //
    // Helper functions
    //

    // Gets a signer from a string address
    function getSignerFromAddress(addr: string): SignerWithAddress | null {
        if (addr1.address == addr) {
            return addr1;
        }

        if (addr2.address == addr) {
            return addr2;
        }

        if (addr3.address == addr) {
            return addr3;
        }

        if (addr4.address == addr) {
            return addr4;
        }

        for (const signerIdx in addrs) {
            if (addrs[signerIdx].address == addr) {
                return addrs[signerIdx];
            }
        }

        return null;
    }

    // Gets a breakdown of the ownership of tokens based on token type
    /*
        [
            0 => {
                addr1: [token1, token2, ...],
                addr2: [token3, token4, ...]
            },
            ...,
            6 => {
                addr1: [token5, token6, ...],
                addr3: [token7, token8, ...]
            },
        ]
    */
    async function getTypeOwnershipBreakdown() {
        // We are going to traverse all tokenIds so we get the supply
        const totalSupply = await contract.totalSupply();
        const tokenTypeBalances: object[] = [];

        for (let i = 1; i <= totalSupply; i++) {
            // Get who owns the token and what type it is
            const tokenOwner = await contract.ownerOf(i);
            const tokenType = await contract.tokenType(i);

            // Creating arrays and objects if needed
            if (!tokenTypeBalances[tokenType]) {
                tokenTypeBalances[tokenType] = {};
            }
            if (!tokenTypeBalances[tokenType][tokenOwner]) {
                tokenTypeBalances[tokenType][tokenOwner] = [];
            }

            // Adding the information to the main array
            tokenTypeBalances[tokenType][tokenOwner].push(i);
        }

        return tokenTypeBalances;
    }

    // Arranges the tokens so "claimer" can claim a prize
    // (i.e., it has one token of each type)
    // Returns the tokens to be used to claim a prize
    async function arrangeTokenTypesForClaimer(claimer: string, tokenBreakdown: object[]) {
        const claimingTokenIds: number[] = [];

        // Loop to traverse the different types in tokenBreakdown
        for (let i = 0; i < TOKEN_TYPE_MAX_SUPPLY.length; i++) {
            // First check to see if the token type exists
            if (!tokenBreakdown[i]) {
                return false;
            }

            // We find out if "claimer" already has that token type
            if (tokenBreakdown[i][claimer]) {
                // If so, we traverse the owned tokens and get the first one
                // that has not been claimed yet
                for (let j = 0; j < tokenBreakdown[i][claimer].length; j++) {
                    const tokenHasBeenClaimed = await contract.tokenClaimed(tokenBreakdown[i][claimer][j]);
                    if (!tokenHasBeenClaimed) {
                        claimingTokenIds[i] = tokenBreakdown[i][claimer][j];
                        break;
                    }
                }
            }

            // Different loop as we might have found a token or not
            if (!claimingTokenIds[i]) {
                owners_loop: for (const owner in tokenBreakdown[i]) {
                    for (let j = 0; j < tokenBreakdown[i][owner].length; j++) {
                        const tokenHasBeenClaimed = await contract.tokenClaimed(tokenBreakdown[i][owner][j]);
                        if (!tokenHasBeenClaimed) {
                            const tokenId = tokenBreakdown[i][owner][j];

                            // Transferring the token to the claimer address
                            const signer = getSignerFromAddress(owner);
                            if (signer) {
                                await contract
                                    .connect(signer)
                                    ["safeTransferFrom(address,address,uint256)"](signer.address, claimer, tokenId);

                                // Rearranging the entries in tokenBreakdown
                                delete tokenBreakdown[i][owner][j];

                                if (!tokenBreakdown[i][claimer]) {
                                    tokenBreakdown[i][claimer] = [];
                                }
                                tokenBreakdown[i][claimer].push(tokenId);

                                // Saving the token as claimed
                                claimingTokenIds[i] = tokenId;

                                // And breaking the loop for this token type
                                break owners_loop;
                            }
                        }
                    }
                }
            }

            // Last check
            if (!claimingTokenIds[i]) {
                return false;
            }
        }

        return claimingTokenIds;
    }

    // `beforeEach` runs before each test, re-deploying the contract every time.
    beforeEach(async () => {
        // Get several accounts to test
        [owner, addr1, addr2, addr3, addr4, ...addrs] = await ethers.getSigners();

        // Get the ContractFactory
        contractFactory = await ethers.getContractFactory(CONTRACT_NAME);

        // Deploy it
        contract = await contractFactory.deploy();

        // Generate merkle tree
        const wlAddresses = [addr1, addr2, ...addrs].map((signer) => signer.address);
        merkleTree = generateMerkleTreeFromAddressList(wlAddresses);

        // Get merkle root and add it to the contract
        const merkleRoot = "0x" + merkleTree.getRoot().toString("hex");
        await contract.connect(owner).setMerkleRoot(merkleRoot);

        // Get addr1 and addr2 merkle proofs
        addr1Proof = getWhitelistHexProof(addr1.address, merkleTree);
        addr2Proof = getWhitelistHexProof(addr2.address, merkleTree);
    });

    //
    ////////////////////////////
    // Deployment information //
    ////////////////////////////
    //
    describe("Deployment information", () => {
        it("Should set the right owner", async () => {
            expect(await contract.owner()).to.equal(owner.address);
        });

        it("Should have the right name and symbol", async () => {
            expect(await contract.name()).to.equal(TOKEN_NAME);
            expect(await contract.symbol()).to.equal(TOKEN_SYMBOL);
        });

        it("Should set the right token URI", async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);

            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            const tokenUri = await contract.tokenURI(1);
            expect(tokenUri).to.equal(TOKEN_RESOURCE_URI);
        });
    });

    //
    /////////////////////////
    // Minting sale status //
    /////////////////////////
    //
    describe("Minting sale status", () => {
        it("Should allow the owner to change from private to public status after some mints", async () => {
            // Activating private sale
            await contract.connect(owner).setSaleState(PRIVATE_SALE_STATUS);

            // Minting some NFTs
            await contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).presaleMint(TEST_MINT_AMOUNT, addr2Proof, { value: TEST_MINT_VALUE });

            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);

            // Minting some more NFTs
            await contract.connect(addr3).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr4).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Minted supply
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(TEST_MINT_AMOUNT * 4);
        });

        it("Should allow the owner to change from public to private status after some mints", async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);

            // Minting some more NFTs
            await contract.connect(addr3).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr4).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Activating private sale
            await contract.connect(owner).setSaleState(PRIVATE_SALE_STATUS);

            // Minting some NFTs
            await contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).presaleMint(TEST_MINT_AMOUNT, addr2Proof, { value: TEST_MINT_VALUE });

            // Minted supply
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(TEST_MINT_AMOUNT * 4);
        });

        it("Should allow the owner to stop the private sale after some mints", async () => {
            // Activating private sale
            await contract.connect(owner).setSaleState(PRIVATE_SALE_STATUS);

            // Minting some NFTs
            await contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).presaleMint(TEST_MINT_AMOUNT, addr2Proof, { value: TEST_MINT_VALUE });

            // Stop the mint
            await contract.connect(owner).setSaleState(SALE_OFF_STATUS);

            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PRIVATE_NOT_ACTIVE_ERROR);

            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PUBLIC_NOT_ACTIVE_ERROR);

            // Minted supply
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(TEST_MINT_AMOUNT * 2);
        });

        it("Should allow the owner to stop the public sale after some mints", async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);

            // Minting some more NFTs
            await contract.connect(addr3).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr4).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Stop the mint
            await contract.connect(owner).setSaleState(SALE_OFF_STATUS);

            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PRIVATE_NOT_ACTIVE_ERROR);

            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PUBLIC_NOT_ACTIVE_ERROR);

            // Minted supply
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(TEST_MINT_AMOUNT * 2);
        });

        it("Should FAIL if somebody tries to private-mint while the sale is not active", async () => {
            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PRIVATE_NOT_ACTIVE_ERROR);
        });

        it("Should FAIL if somebody tries to public-mint while the sale is not active", async () => {
            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PUBLIC_NOT_ACTIVE_ERROR);
        });

        it("Should FAIL if somebody tries to public-mint while the private sale is active", async () => {
            // Activating private sale
            await contract.connect(owner).setSaleState(PRIVATE_SALE_STATUS);

            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PUBLIC_NOT_ACTIVE_ERROR);
        });
    });

    //
    ///////////////////////////////////////
    // Presale minting success scenarios //
    ///////////////////////////////////////
    //
    describe("Presale minting success scenarios", () => {
        // `beforeEach` runs before each test in this block, activating presale minting
        beforeEach(async () => {
            // Activating private sale
            await contract.connect(owner).setSaleState(PRIVATE_SALE_STATUS);
        });

        it("Should allow anybody whitelisted to mint an NFT for themselves and change its balance and ownership", async () => {
            await contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE });
            const addr1Balance = await contract.balanceOf(addr1.address);
            const tokenOwner = await contract.ownerOf(1);
            expect(addr1Balance).to.equal(TEST_MINT_AMOUNT);
            expect(tokenOwner).to.equal(addr1.address);
        });

        it("Should keep track of the minted supply", async () => {
            await contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).presaleMint(TEST_MINT_AMOUNT, addr2Proof, { value: TEST_MINT_VALUE });
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(TEST_MINT_AMOUNT * 2);
        });

        it("Should add up all funds and keep them in the contract", async () => {
            await contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).presaleMint(TEST_MINT_AMOUNT, addr2Proof, { value: TEST_MINT_VALUE });

            const contractBalanceRaw = await ethers.provider.getBalance(contract.address);
            const contractBalance = Number(ethers.utils.formatEther(contractBalanceRaw));
            const expectedBalance = Number(ethers.utils.formatEther(TEST_MINT_VALUE));
            expect(contractBalance).to.equal(expectedBalance * 2);
        });
    });

    //
    ////////////////////////////////////
    // Presale minting FAIL scenarios //
    ////////////////////////////////////
    //
    describe("Presale minting FAIL scenarios", () => {
        // `beforeEach` runs before each test in this block, activating presale minting
        beforeEach(async () => {
            // Activating private sale
            await contract.connect(owner).setSaleState(PRIVATE_SALE_STATUS);
        });

        it("Should FAIL if somebody who's not whitelisted tries to mint", async () => {
            // Trying to mint with non whitelisted address
            await expect(
                contract.connect(addr3).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(ADDRESS_NOT_WHITELISTED_ERROR);
        });

        it("Should FAIL if somebody tries to mint with 0x0 or [] proof", async () => {
            // Trying to mint with general proof (whitelisted and not whitelisted)
            await expect(
                contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, [], { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(ADDRESS_NOT_WHITELISTED_ERROR);

            await expect(
                contract
                    .connect(addr1)
                    .presaleMint(
                        TEST_MINT_AMOUNT,
                        ["0x0000000000000000000000000000000000000000000000000000000000000000"],
                        { value: TEST_MINT_VALUE }
                    )
            ).to.be.revertedWith(ADDRESS_NOT_WHITELISTED_ERROR);

            await expect(
                contract.connect(addr3).presaleMint(TEST_MINT_AMOUNT, [], { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(ADDRESS_NOT_WHITELISTED_ERROR);

            await expect(
                contract
                    .connect(addr3)
                    .presaleMint(
                        TEST_MINT_AMOUNT,
                        ["0x0000000000000000000000000000000000000000000000000000000000000000"],
                        { value: TEST_MINT_VALUE }
                    )
            ).to.be.revertedWith(ADDRESS_NOT_WHITELISTED_ERROR);
        });

        it("Should FAIL if somebody tries to mint with wrong proof", async () => {
            // Trying to mint with wrong proof
            await expect(
                contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr2Proof, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(ADDRESS_NOT_WHITELISTED_ERROR);
        });

        it("Should FAIL if somebody tries to public mint", async () => {
            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PUBLIC_NOT_ACTIVE_ERROR);
        });

        it("Should FAIL if somebody tries to mint more than the maximum mint amount", async () => {
            const tokenAmount = MAX_MINT_AMOUNT + 1;
            const mintPrice = ethers.utils.parseEther(String(MINT_PRICE * tokenAmount));

            // Trying to mint more than the maximum tokens allowed
            await expect(
                contract.connect(addr1).presaleMint(tokenAmount, addr1Proof, { value: mintPrice })
            ).to.be.revertedWith(WRONG_AMOUNT_ERROR);
        });

        it("Should FAIL if somebody tries to mint more than the supply left", async () => {
            // Minting all supply except a few
            for (let supply = 0; supply + TEST_MINT_AMOUNT < MAX_SUPPLY; supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE });
            }

            // Try to max mint when there's no supply left
            const tokenAmount = MAX_MINT_AMOUNT;
            const mintPrice = ethers.utils.parseEther(String(MINT_PRICE * tokenAmount));

            await expect(
                contract.connect(addr1).presaleMint(tokenAmount, addr1Proof, { value: mintPrice })
            ).to.be.revertedWith(NO_SUPPLY_LEFT_ERROR);

            // But supply can be fully minted
            const currentSupply = await contract.totalSupply();
            const tokenAmountLeft = MAX_SUPPLY - currentSupply;
            const mintPriceLeft = ethers.utils.parseEther(String(MINT_PRICE * tokenAmountLeft));
            await contract.connect(addr1).presaleMint(tokenAmountLeft, addr1Proof, { value: mintPriceLeft });

            // And supply is maxed
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(MAX_SUPPLY);
        });

        it("Should FAIL if somebody tries to mint with a price lower than established", async () => {
            const mintPrice = ethers.utils.parseEther(String((MINT_PRICE - 0.005) * TEST_MINT_AMOUNT));

            // Trying to mint tokens with a lower price
            await expect(
                contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: mintPrice })
            ).to.be.revertedWith(WRONG_PRICE_ERROR);
        });
    });

    //
    //////////////////////////////////////
    // Public minting success scenarios //
    //////////////////////////////////////
    //
    describe("Public minting success scenarios", () => {
        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);
        });

        it("Should allow anybody who's whitelisted to mint an NFT for themselves and change its balance and ownership", async () => {
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            const addr1Balance = await contract.balanceOf(addr1.address);
            const tokenOwner = await contract.ownerOf(1);
            expect(addr1Balance).to.equal(TEST_MINT_AMOUNT);
            expect(tokenOwner).to.equal(addr1.address);
        });

        it("Should allow anybody who's not whitelisted to mint an NFT for themselves and change its balance and ownership", async () => {
            await contract.connect(addr3).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            const addr3Balance = await contract.balanceOf(addr3.address);
            const tokenOwner = await contract.ownerOf(1);
            expect(addr3Balance).to.equal(TEST_MINT_AMOUNT);
            expect(tokenOwner).to.equal(addr3.address);
        });

        it("Should keep track of the minted supply", async () => {
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(TEST_MINT_AMOUNT * 2);
        });

        it("Should add up all funds and keep them in the contract", async () => {
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            const contractBalanceRaw = await ethers.provider.getBalance(contract.address);
            const contractBalance = Number(ethers.utils.formatEther(contractBalanceRaw));
            const expectedBalance = Number(ethers.utils.formatEther(TEST_MINT_VALUE));
            expect(contractBalance).to.equal(expectedBalance * 2);
        });
    });

    //
    ///////////////////////////////////
    // Public minting FAIL scenarios //
    ///////////////////////////////////
    //
    describe("Public minting FAIL scenarios", () => {
        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);
        });

        it("Should FAIL if somebody tries to private mint", async () => {
            // Trying to mint while the sale is not active
            await expect(
                contract.connect(addr1).presaleMint(TEST_MINT_AMOUNT, addr1Proof, { value: TEST_MINT_VALUE })
            ).to.be.revertedWith(SALE_PRIVATE_NOT_ACTIVE_ERROR);
        });

        it("Should FAIL if somebody tries to mint more than the maximum mint amount", async () => {
            const tokenAmount = MAX_MINT_AMOUNT + 1;
            const mintPrice = ethers.utils.parseEther(String(MINT_PRICE * tokenAmount));

            // Trying to mint more than the maximum tokens allowed
            await expect(contract.connect(addr1).publicMint(tokenAmount, { value: mintPrice })).to.be.revertedWith(
                WRONG_AMOUNT_ERROR
            );
        });

        it("Should FAIL if somebody tries to mint more than the supply left", async () => {
            // Minting all supply except a few
            for (let supply = 0; supply + TEST_MINT_AMOUNT < MAX_SUPPLY; supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            }

            // Try to max mint when there's no supply left
            const tokenAmount = MAX_MINT_AMOUNT;
            const mintPrice = ethers.utils.parseEther(String(MINT_PRICE * tokenAmount));

            await expect(contract.connect(addr1).publicMint(tokenAmount, { value: mintPrice })).to.be.revertedWith(
                NO_SUPPLY_LEFT_ERROR
            );

            // But supply can be fully minted
            const currentSupply = await contract.totalSupply();
            const tokenAmountLeft = MAX_SUPPLY - currentSupply;
            const mintPriceLeft = ethers.utils.parseEther(String(MINT_PRICE * tokenAmountLeft));
            await contract.connect(addr1).publicMint(tokenAmountLeft, { value: mintPriceLeft });

            // And supply is maxed
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(MAX_SUPPLY);
        });

        it("Should FAIL if somebody tries to mint with a price lower than established", async () => {
            const mintPrice = ethers.utils.parseEther(String((MINT_PRICE - 0.005) * TEST_MINT_AMOUNT));

            // Trying to mint tokens with a lower price
            await expect(contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: mintPrice })).to.be.revertedWith(
                WRONG_PRICE_ERROR
            );
        });
    });

    //
    /////////////////
    // Token types //
    /////////////////
    //
    describe("Token types", () => {
        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);
        });

        it("Should show the right supply per token type after selling out", async () => {
            // Minting all supply
            for (let supply = 0; supply + TEST_MINT_AMOUNT < MAX_SUPPLY; supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            }
            const currentSupply = await contract.totalSupply();
            const tokenAmountLeft = MAX_SUPPLY - currentSupply;
            const mintPriceLeft = ethers.utils.parseEther(String(MINT_PRICE * tokenAmountLeft));
            await contract.connect(addr1).publicMint(tokenAmountLeft, { value: mintPriceLeft });

            // Supply is maxed
            const totalSupply = await contract.totalSupply();
            expect(totalSupply).to.equal(MAX_SUPPLY);

            // Token types supplies are maxed
            const tokenTypeSupply = await contract.tokenTypeSupply();
            for (let i = 0; i < TOKEN_TYPE_MAX_SUPPLY.length; i++) {
                expect(tokenTypeSupply[i]).to.equal(TOKEN_TYPE_MAX_SUPPLY[i]);
            }
        });
    });

    //
    ////////////////////////////
    // Transferring scenarios //
    ////////////////////////////
    //
    describe("Transferring scenarios", () => {
        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);
        });

        it("Should allow anybody to transfer his NFT", async () => {
            const tokenId = 2;

            // Minting NFTs
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Checking ownership of token
            const tokenOwner1 = await contract.ownerOf(tokenId);
            expect(tokenOwner1).to.equal(addr1.address);

            // Transferring token to addr2
            // To call safeTransferFrom, need to specify its signature
            // ( https://stackoverflow.com/questions/68289806/no-safetransferfrom-function-in-ethers-js-contract-instance )
            await contract
                .connect(addr1)
                ["safeTransferFrom(address,address,uint256)"](addr1.address, addr2.address, tokenId);
            const tokenOwner2 = await contract.ownerOf(tokenId);
            expect(tokenOwner2).to.equal(addr2.address);
        });

        it("Should FAIL if somebody transfers a non-owned NFT", async () => {
            const tokenId = 2;

            // Minting NFTs
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr2).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Trying to transfer tokenId from addr1 (non owner)
            await expect(
                contract
                    .connect(addr2)
                    ["safeTransferFrom(address,address,uint256)"](addr2.address, addr3.address, tokenId)
            ).to.be.revertedWith("ERC721: caller is not token owner nor approved");
        });
    });

    //
    ////////////////////
    // Prize claiming //
    ////////////////////
    //
    describe("Prize claiming scenarios (Minting all supply)", () => {
        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);

            // Minting all supply
            for (let supply = 0; supply + TEST_MINT_AMOUNT < MAX_SUPPLY; supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            }
            const currentSupply = await contract.totalSupply();
            const tokenAmountLeft = MAX_SUPPLY - currentSupply;
            const mintPriceLeft = ethers.utils.parseEther(String(MINT_PRICE * tokenAmountLeft));
            await contract.connect(addr1).publicMint(tokenAmountLeft, { value: mintPriceLeft });
        });

        it("Should allow wallets with all assets to claim a prize", async () => {
            // Saving wallet and contract balance
            const addr1BalanceRaw = await ethers.provider.getBalance(addr1.address);
            const contractBalanceRaw = await ethers.provider.getBalance(contract.address);

            // Finding tokenIds to claim the prize
            const tokenTypeBalances = await getTypeOwnershipBreakdown();
            const tokenIds = await arrangeTokenTypesForClaimer(addr1.address, tokenTypeBalances);
            expect(tokenIds).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);

            // First prize should be claimable
            const tx = await contract.connect(addr1).claimPrize(tokenIds);
            const txReceipt = await tx.wait();
            const gasUsedRaw = ethers.BigNumber.from(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice));

            // Checking new balances
            const addr1FinalBalanceRaw = await ethers.provider.getBalance(addr1.address);
            const addr1FinalBalance = Number(ethers.utils.formatEther(addr1FinalBalanceRaw));
            const finalContractBalanceRaw = await ethers.provider.getBalance(contract.address);
            const finalContractBalance = Number(ethers.utils.formatEther(finalContractBalanceRaw));

            // Testing final values
            const expectedaddr1Balance = Number(
                ethers.utils.formatEther(addr1BalanceRaw.add(gasUsedRaw).add(ethers.utils.parseEther("1")))
            );
            const expectedcontractBalance = Number(
                ethers.utils.formatEther(contractBalanceRaw.sub(ethers.utils.parseEther("1")))
            );
            expect(addr1FinalBalance.toFixed(2)).to.equal(expectedaddr1Balance.toFixed(2));
            expect(finalContractBalance.toFixed(2)).to.equal(expectedcontractBalance.toFixed(2));
        });

        it("Should FAIL if someone claims a prize after all prizes have been claimed", async () => {
            // Claiming first prize
            const tokenTypeBalancesFirstPrize = await getTypeOwnershipBreakdown();
            const tokenIdsFirstPrize = await arrangeTokenTypesForClaimer(addr1.address, tokenTypeBalancesFirstPrize);
            expect(tokenIdsFirstPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);
            await contract.connect(addr1).claimPrize(tokenIdsFirstPrize);

            // Claiming second prize
            const tokenTypeBalancesSecondPrize = await getTypeOwnershipBreakdown();
            const tokenIdsSecondPrize = await arrangeTokenTypesForClaimer(addr2.address, tokenTypeBalancesSecondPrize);
            expect(tokenIdsSecondPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);
            await contract.connect(addr2).claimPrize(tokenIdsSecondPrize);

            // Claiming third prize
            const tokenTypeBalancesThirdPrize = await getTypeOwnershipBreakdown();
            const tokenIdsThirdPrize = await arrangeTokenTypesForClaimer(addr3.address, tokenTypeBalancesThirdPrize);
            expect(tokenIdsThirdPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);
            await contract.connect(addr3).claimPrize(tokenIdsThirdPrize);

            // Trying to claim another prize
            await expect(contract.connect(addr1).claimPrize(tokenIdsFirstPrize)).to.be.revertedWith(
                ALL_PRIZES_CLAIMED_ERROR
            );
        });

        it("Should FAIL if someone tries to claim two prizes", async () => {
            // Claiming first prize
            const tokenTypeBalancesFirstPrize = await getTypeOwnershipBreakdown();
            const tokenIdsFirstPrize = await arrangeTokenTypesForClaimer(addr1.address, tokenTypeBalancesFirstPrize);
            expect(tokenIdsFirstPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);
            await contract.connect(addr1).claimPrize(tokenIdsFirstPrize);

            // Trying to claim a second prize from the same wallet
            const tokenTypeBalancesSecondPrize = await getTypeOwnershipBreakdown();
            const tokenIdsSecondPrize = await arrangeTokenTypesForClaimer(addr1.address, tokenTypeBalancesSecondPrize);
            expect(tokenIdsSecondPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);
            await expect(contract.connect(addr1).claimPrize(tokenIdsSecondPrize)).to.be.revertedWith(
                WALLET_CANT_CLAIM_NEW_PRICE_ERROR
            );
        });

        it("Should FAIL if someone tries to claim a prize specifying tokens that have been used to claim a prize before", async () => {
            // Claiming first prize
            const tokenTypeBalancesFirstPrize = await getTypeOwnershipBreakdown();
            const tokenIdsFirstPrize = await arrangeTokenTypesForClaimer(addr1.address, tokenTypeBalancesFirstPrize);
            expect(tokenIdsFirstPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);
            await contract.connect(addr1).claimPrize(tokenIdsFirstPrize);

            // Getting tokens to claim a second prize
            const tokenTypeBalancesSecondPrize = await getTypeOwnershipBreakdown();
            const tokenIdsSecondPrize = await arrangeTokenTypesForClaimer(addr2.address, tokenTypeBalancesSecondPrize);
            expect(tokenIdsSecondPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);

            // Transferring one of the claimed tokens to be used for the second wallet
            await contract
                .connect(addr1)
                ["safeTransferFrom(address,address,uint256)"](addr1.address, addr2.address, tokenIdsFirstPrize[5]);
            tokenIdsSecondPrize[5] = tokenIdsFirstPrize[5];

            // Trying to claim a second prize using one token from the first prize
            await expect(contract.connect(addr2).claimPrize(tokenIdsSecondPrize)).to.be.revertedWith(
                TOKEN_USED_TO_CLAIM_PRIZE_BEFORE_ERROR
            );
        });

        it("Should FAIL if someone tries to claim a prize specifying tokens it does not have", async () => {
            // Claiming first prize
            const tokenTypeBalancesFirstPrize = await getTypeOwnershipBreakdown();
            const tokenIdsFirstPrize = await arrangeTokenTypesForClaimer(addr1.address, tokenTypeBalancesFirstPrize);
            expect(tokenIdsFirstPrize).to.have.lengthOf(TOKEN_TYPE_MAX_SUPPLY.length);

            // Trying to claim a prize using tokens from another account
            await expect(contract.connect(addr2).claimPrize(tokenIdsFirstPrize)).to.be.revertedWith(
                CLAIMER_NOT_OWNER_ERROR
            );
        });
    });

    describe("Prize claiming scenarios (Without minting all supply)", () => {
        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);
        });

        it("Should FAIL if someone tries to claim a prize without specifying assets", async () => {
            // Minting some tokens
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Trying to claim a prize without specifying assets
            await expect(contract.connect(addr1).claimPrize()).to.be.rejectedWith(Error);
        });

        it("Should FAIL if someone tries to claim a prize specifying less or more than 6 tokens", async () => {
            // Minting some tokens
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Try to claim the prize with 5 tokens
            await expect(contract.connect(addr1).claimPrize([1, 2, 3, 4, 5])).to.be.rejectedWith(Error);

            // Try to claim the prize with 7 tokens
            await expect(contract.connect(addr1).claimPrize([1, 2, 3, 4, 5, 6, 7])).to.be.rejectedWith(Error);
        });

        it("Should FAIL if someone tries to claim a prize specifying tokens of the same type", async () => {
            // Minting half supply (to be able to claim a price)
            for (let supply = 0; supply + TEST_MINT_AMOUNT < MAX_SUPPLY / 2; supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            }

            // Try to claim the prize with tokens of the same type
            // (I'm assuming the first 6 tokens won't be all different types)
            await expect(contract.connect(addr1).claimPrize([1, 2, 3, 4, 5, 6])).to.be.revertedWith(
                TWO_TOKENS_OF_SAME_TYPE_ERROR
            );
        });

        it("Should FAIL if someone tries to claim a prize specifying tokens that have not been minted", async () => {
            // Minting half supply (to be able to claim a price)
            for (let supply = 0; supply + TEST_MINT_AMOUNT < MAX_SUPPLY / 2; supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            }

            // Try to claim the prize with one token that have not been minted
            await expect(contract.connect(addr1).claimPrize([999, 1, 2, 3, 4, 5])).to.be.revertedWith(
                NOT_MINTED_TOKEN_ERROR
            );
        });
    });

    /*
    describe("[SPECIAL] Prize claiming scenarios withouth tokenId check (remove that block from contract)", () => {
        const SUPPLY_LOW_FOR_CLAIMING_PRICE_ERROR = "Prize can't be claimed yet. Some more mints needed";

        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);
        });

        it("Should FAIL if someone claims a prize before 1/3 of the supply is minted", async () => {
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Trying to claim a prize
            await expect(contract.connect(addr1).claimPrize()).to.be.revertedWith(SUPPLY_LOW_FOR_CLAIMING_PRICE_ERROR);
        });

        it("Should FAIL if someone claims a second prize before 2/3 of the supply is minted", async () => {
            // Minting half supply
            for (let supply = 0; supply + TEST_MINT_AMOUNT < (MAX_SUPPLY / 2); supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            }

            // First prize should be claimable
            await contract.connect(addr1).claimPrize();

            // Trying to claim a second prize
            await expect(contract.connect(addr2).claimPrize()).to.be.revertedWith(SUPPLY_LOW_FOR_CLAIMING_PRICE_ERROR);
        });

        it("Should FAIL if someone claims a third prize before the whole supply is minted", async () => {
            // Minting almost all supply
            for (let supply = 0; supply + TEST_MINT_AMOUNT < (MAX_SUPPLY - TEST_MINT_AMOUNT); supply += TEST_MINT_AMOUNT) {
                await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            }

            // First prize should be claimable
            await contract.connect(addr1).claimPrize();

            // As well as second
            await contract.connect(addr2).claimPrize();

            // Trying to claim a third prize
            await expect(contract.connect(addr3).claimPrize()).to.be.revertedWith(SUPPLY_LOW_FOR_CLAIMING_PRICE_ERROR);
        });
    });
    */

    //
    ////////////////////
    // Withdraw funds //
    ////////////////////
    //
    describe("Withdraw funds", () => {
        // `beforeEach` runs before each test in this block, activating public minting
        beforeEach(async () => {
            // Activating public sale
            await contract.connect(owner).setSaleState(PUBLIC_SALE_STATUS);
        });

        it("Should allow owner to withdraw funds", async () => {
            // Minting NFTs
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Current contract and owner balances
            const currentContractBalanceRaw = await ethers.provider.getBalance(contract.address);
            const currentOwnerBalanceRaw = await ethers.provider.getBalance(owner.address);

            // Withdraw by owner
            const tx = await contract.connect(owner).withdraw();
            const txReceipt = await tx.wait();
            const gasUsedRaw = ethers.BigNumber.from(txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice));

            // Check final balances
            const finalContractBalanceRaw = await ethers.provider.getBalance(contract.address);
            const finalContractBalance = Number(ethers.utils.formatEther(finalContractBalanceRaw));
            const finalOwnerBalanceRaw = await ethers.provider.getBalance(owner.address);
            const finalOwnerBalance = Number(ethers.utils.formatEther(finalOwnerBalanceRaw));

            // Testing final values
            const expectedOwnerBalance = Number(
                ethers.utils.formatEther(currentOwnerBalanceRaw.add(gasUsedRaw).add(currentContractBalanceRaw))
            );
            expect(finalContractBalance).to.equal(0);
            expect(finalOwnerBalance.toFixed(2)).to.equal(expectedOwnerBalance.toFixed(2));
        });

        it("Should FAIL if any other user tries to withdraw funds", async () => {
            // Minting NFTs
            await contract.connect(addr1).publicMint(TEST_MINT_AMOUNT, { value: TEST_MINT_VALUE });

            // Trying to withdraw funds (non owner)
            await expect(contract.connect(addr1).withdraw()).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });
});
