import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

export default (base64Proof: string, address: string, merkleTreeRoot: string) => {
    // Convert base64 proof to String[] proof
    const hexProof = JSON.parse(Buffer.from(base64Proof, "base64").toString("ascii"));
    const hashedAddress = keccak256(address);

    // Verification
    const verificationResult = MerkleTree.verify(hexProof, hashedAddress, merkleTreeRoot, keccak256, {
        sortPairs: true,
    });

    // Showing result
    console.log(verificationResult);
};
