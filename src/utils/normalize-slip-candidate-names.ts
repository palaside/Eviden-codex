import type { LocalSlipCandidate } from "@/utils/local-qr-extractor";
import { removeThaiTitlePrefix } from "./recipient-name-normalization.mjs";

export function normalizeSlipCandidateNames(candidate: LocalSlipCandidate): LocalSlipCandidate {
  return {
    ...candidate,
    data: {
      ...candidate.data,
      sender: {
        ...candidate.data.sender,
        name: candidate.data.sender.name
          ? candidate.data.sender.name.includes("*")
            ? candidate.data.sender.name.trim()
            : removeThaiTitlePrefix(candidate.data.sender.name)
          : candidate.data.sender.name,
      },
      receiver: {
        ...candidate.data.receiver,
        name: candidate.data.receiver.name
          ? removeThaiTitlePrefix(candidate.data.receiver.name)
          : candidate.data.receiver.name,
      },
    },
  };
}
