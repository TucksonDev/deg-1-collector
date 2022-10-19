import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import fs from "fs";

export const generateMerkleTreeFromAddressList = (wlAddresses: string[]) => {
    // Generating hashed leaf nodes
    const leafNodes = wlAddresses.map((address) => keccak256(address));

    // Calculating the merkle tree
    return new MerkleTree(leafNodes, keccak256, { sortPairs: true });
};

function generateMerkleTree() {
    const filename = __dirname + "/../data/" + "wlAddresses";
    const wlAddresses = fs.readFileSync(filename).toString().split("\n");

    return generateMerkleTreeFromAddressList(wlAddresses);
}
export const merkleTree = generateMerkleTree();

export const showMerkleTree = () => {
    const merkleTree = generateMerkleTree();
    // Showing the result
    console.log("Merkle Tree\n", merkleTree.toString());

    // Showing the merkle root
    console.log("Merkle Root hash\n", merkleTree.getRoot().toString("hex"));
};
