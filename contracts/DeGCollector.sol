// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * DeG 1 - DeGCollector
 *
 * @author Tuckson
 * @title DeG 1 - DeGCollector
 */
contract DeGCollector is ERC721, Ownable, ReentrancyGuard {
    //
    ///////////////////////////////////
    // Constants and state variables //
    ///////////////////////////////////
    //

    // Token types
    enum TokenType {
        Common, // 0
        Black, // 1
        White, // 2
        Silver, // 3
        Gold, // 4
        Diamond // 5
    }

    // Tokenomics
    uint8 private constant TOKEN_TYPES = 6;
    uint16 private constant MAX_SUPPLY = 999;
    uint16 private _totalSupply = 0;
    uint16[6] private _tokenTypeMaxSupply = [590, 200, 200, 3, 3, 3];
    uint16[6] private _tokenTypeSupply = [0, 0, 0, 0, 0, 0];

    // Price and availability
    uint256 private constant TOKEN_PRICE = 0.01 ether;
    uint8 private constant MAX_MINT_AMOUNT_PER_WALLET = 3;

    // Sale constants and structures
    enum SaleState {
        Off,
        Presale,
        Public
    } // [0 - Off, 1 - Presale, 2 - Public]
    SaleState private _saleState = SaleState.Off;

    // Whitelisting
    bytes32 private _merkleRoot = 0x0;

    // Prizes
    uint8 private constant MAX_WINNERS = 3;
    mapping(address => uint8) private _winners;
    uint8 private _winnersCount = 0;

    // Token information
    struct TokenInfo {
        TokenType tokenType;
        uint8 claimed;
    }
    mapping(uint256 => TokenInfo) private _tokenInfo;

    //
    /////////////////
    // Constructor //
    /////////////////
    //
    constructor() ERC721("DeGCollector", "DEGCOLL") {}

    //
    //////////////////////////////
    // Private helper functions //
    //////////////////////////////
    //
    /**
     * @dev Mints an amount of tokens
     * @param amount of tokens to mint
     *
     * Notes:
     * - ReentrancyGuard is needed here because of the for loop:
     * - https://ethereum.stackexchange.com/questions/117793/is-reentrancy-guard-needed-in-erc-721-minting-process-and-why-so
     *
     * Requirements:
     *
     * - `amount` must be between 1 and the specified maximum amount per wallet
     * - `amount` added to the tokens already minted by the caller cannot be greater than the specified maximum amount per wallet
     * - Paid amount must be equal or greater than the specified price per token multiplied by the amount to mint
     */
    function mint(uint8 amount) internal {
        require(amount > 0 && amount <= MAX_MINT_AMOUNT_PER_WALLET, "Amount must be between 1 and 3");
        require(_totalSupply + amount <= MAX_SUPPLY, "No supply available to mint that amount");
        require(msg.value >= amount * TOKEN_PRICE, "Price must be .01 eth per token");

        for (uint8 i = 0; i < amount; i++) {
            _safeMint(_msgSender(), ++_totalSupply);
        }
    }

    /**
     * @dev Returns a random token type for the mint
     * @return uint8 a random TokenType
     */
    function getRandomTokenType() internal returns (uint8) {
        // Getting a number between 0 and the supply available
        // We will use this as the offset to get the token type
        // NOTE: _totalSupply is incremented before calling this function, so we need a "- 1"
        uint256 tokenTypeIndexOffset = uint256(
            keccak256(
                abi.encodePacked(
                    // solhint-disable-next-line not-rely-on-time
                    block.timestamp,
                    blockhash(block.number - 1),
                    _msgSender(),
                    _totalSupply
                )
            )
        ) % (MAX_SUPPLY - (_totalSupply - 1));

        // Gets the token type according to the obtained offset
        uint16 currentOffset = 0;
        uint8 tokenTypeId = 0;
        for (uint8 i = 0; i < _tokenTypeSupply.length; i++) {
            if (tokenTypeIndexOffset < (currentOffset + (_tokenTypeMaxSupply[i] - _tokenTypeSupply[i]))) {
                tokenTypeId = i;
                break;
            }

            currentOffset += (_tokenTypeMaxSupply[i] - _tokenTypeSupply[i]);
        }

        // Adjusts new supply for this type of token
        _tokenTypeSupply[tokenTypeId]++;

        return tokenTypeId;
    }

    /**
     * @dev See {ERC721-_afterTokenTransfer}. This override additionally randomize the type of
     *  token to get and stores the token information. Only when minting.
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        // Instructions when minting //
        if (from == address(0)) {
            // Get a token type
            uint8 tokenTypeId = getRandomTokenType();

            // Saves the token information
            _tokenInfo[tokenId] = TokenInfo({tokenType: TokenType(tokenTypeId), claimed: 0});
        }

        // Super callback
        super._afterTokenTransfer(from, to, tokenId);
    }

    //
    /////////////////////
    // Admin functions //
    /////////////////////
    //
    /**
     * @dev Withdraws the ether received by the minters
     *
     * Requirements:
     *
     * - can only be called by the owner of the contract
     */
    function withdraw() public onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    //
    /////////////
    // Setters //
    /////////////
    //
    /**
     * @dev Sets the state of the sale
     * @param newSaleState changes the state of the sale
     *
     * Requirements:
     *
     * - can only be called by the owner of the contract
     */
    function setSaleState(SaleState newSaleState) public onlyOwner {
        _saleState = newSaleState;
    }

    /**
     * @dev Sets the merkle root for the private sale
     * @param newMerkleRoot hash of the merkle root of the whitelisted addresses
     *
     * Requirements:
     *
     * - can only be called by the owner of the contract
     */
    function setMerkleRoot(bytes32 newMerkleRoot) public onlyOwner {
        _merkleRoot = newMerkleRoot;
    }

    //
    /////////////
    // Getters //
    /////////////
    //
    /**
     * @dev Returns the total minted supply of all tokens
     * @return uint256 current minted supply for all tokens
     */
    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev Returns the total minted supply for each token type
     * @return uint16[] current minted supply for each token type
     */
    function tokenTypeSupply() public view returns (uint16[TOKEN_TYPES] memory) {
        return _tokenTypeSupply;
    }

    /**
     * @dev Returns the current state of the sale
     * @return SaleState current state of the sale
     */
    function saleState() public view returns (SaleState) {
        return _saleState;
    }

    /**
     * @dev Returns the token type of a specific token id
     * @param tokenId token id to get the token type of
     * @return TokenType of the specified token id
     */
    function tokenType(uint256 tokenId) public view returns (TokenType) {
        return _tokenInfo[tokenId].tokenType;
    }

    /**
     * @dev Returns true if the specified token id has been used to claim a prize
     * @param tokenId token id to evaluate
     * @return bool result of the evaluation
     */
    function tokenClaimed(uint256 tokenId) public view returns (bool) {
        return (_tokenInfo[tokenId].claimed == 1);
    }

    /**
     * @dev See {IERC721Metadata-tokenURI}. This override returns a different uri
     *  for each token type.
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        if (_tokenInfo[tokenId].tokenType == TokenType.Black) {
            return "ipfs://QmY73kCnAqXooQbK5kUpk2jBF1JvWPBBSR6whRaNMoTsj7";
        }

        if (_tokenInfo[tokenId].tokenType == TokenType.White) {
            return "ipfs://QmY73kCnAqXooQbK5kUpk2jBF1JvWPBBSR6whRaNMoTsj7";
        }

        if (_tokenInfo[tokenId].tokenType == TokenType.Silver) {
            return "ipfs://QmY73kCnAqXooQbK5kUpk2jBF1JvWPBBSR6whRaNMoTsj7";
        }

        if (_tokenInfo[tokenId].tokenType == TokenType.Gold) {
            return "ipfs://QmY73kCnAqXooQbK5kUpk2jBF1JvWPBBSR6whRaNMoTsj7";
        }

        if (_tokenInfo[tokenId].tokenType == TokenType.Diamond) {
            return "ipfs://QmY73kCnAqXooQbK5kUpk2jBF1JvWPBBSR6whRaNMoTsj7";
        }

        // Common //
        return "ipfs://QmY73kCnAqXooQbK5kUpk2jBF1JvWPBBSR6whRaNMoTsj7";
    }

    //
    ///////////////////////
    // Public operations //
    ///////////////////////
    //

    /**
     * @dev Mints a number of tokens
     * @param amount amount of tokens to mint
     * @param merkleProof proof that the caller is whitelisted
     *
     * Requirements:
     *
     * - _saleState must be in Presale
     * - caller of the function must be whitelisted
     */
    function presaleMint(uint8 amount, bytes32[] calldata merkleProof) public payable nonReentrant {
        require(_saleState == SaleState.Presale, "Presale is not active");
        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
        require(MerkleProof.verify(merkleProof, _merkleRoot, leaf), "Address is not whitelisted");
        mint(amount);
    }

    /**
     * @dev Mints a number of tokens
     * @param amount amount of tokens to mint
     *
     * Requirements:
     *
     * - _saleState must be in Public
     */
    function publicMint(uint8 amount) public payable nonReentrant {
        require(_saleState == SaleState.Public, "Public sale is not active");
        mint(amount);
    }

    /**
     * @dev Claims a prize
     * @param tokenIds array of token ids to use to claim a prize
     *
     * Requirements:
     *
     * - There must be prizes left
     * - Caller must not have claimed a prize before
     * - Total supply must be enough to be able to claim a prize
     * - All specified token ids must exist and must not have been used to claim another prize
     * - Tokens specified must each be a different type
     * - Tokens specified must be owned by the caller
     */
    function claimPrize(uint16[TOKEN_TYPES] memory tokenIds) public nonReentrant {
        require(_winnersCount < MAX_WINNERS, "All prizes have been claimed");
        require(_winners[_msgSender()] == 0, "Wallet has already claimed a prize");

        // Supply needed to claim a prize
        uint16 supplyNeeded = (MAX_SUPPLY / MAX_WINNERS) * (_winnersCount + 1);
        require(_totalSupply >= supplyNeeded, "Prize can't be claimed yet. Some more mints needed");

        // Checking tokenIds
        // We need one token of each type and they must not have been used
        // to claim another prize
        uint16[TOKEN_TYPES] memory sortedTokenIds;
        uint8 tokenTypeCount = 0;
        for (uint8 i = 0; i < TOKEN_TYPES; i++) {
            uint16 tokenId = tokenIds[i];

            // Token existence
            require(_exists(tokenId), "One token has not been minted yet");

            // Claimed token validation
            require(_tokenInfo[tokenId].claimed == 0, "One of the tokens has been used to claim another prize");

            // Same token type validation
            require(sortedTokenIds[uint8(_tokenInfo[tokenId].tokenType)] == 0, "Can't use two tokens of the same type");

            // Ownership validation
            require(ownerOf(tokenId) == _msgSender(), "Can't claim prize if you don't own the token");

            // Adding the token to the sorted array
            sortedTokenIds[uint8(_tokenInfo[tokenId].tokenType)] = tokenId;

            // And incrementing the tokenTypeCount
            tokenTypeCount++;
        }

        // This will probably never get triggered
        require(tokenTypeCount == TOKEN_TYPES, "6 tokens of different types are needed to claim a prize");

        // Marking these tokens as claimed
        for (uint8 i = 0; i < TOKEN_TYPES; i++) {
            _tokenInfo[sortedTokenIds[i]].claimed = 1;
        }

        // Adjusting winners array and winnersCount
        _winnersCount++;
        _winners[_msgSender()] = 1;

        // Sending prize to winner
        payable(msg.sender).transfer(1 ether);
    }
}
