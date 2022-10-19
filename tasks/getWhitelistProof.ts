import keccak256 from "keccak256";
import MerkleTree from "merkletreejs";
import { merkleTree } from "./generateMerkleTree";

export const getWhitelistHexProof = (address: string, _merkleTree: MerkleTree) => {
    return _merkleTree.getHexProof(keccak256(address));
};

export default (address: string) => {
    const hexProof = getWhitelistHexProof(address, merkleTree);
    console.log("Hex proof\n", hexProof);

    const base64Proof = Buffer.from(JSON.stringify(hexProof)).toString("base64");
    console.log("Base64 proof\n", base64Proof);
};
