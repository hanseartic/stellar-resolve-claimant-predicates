import {
    Horizon,
    xdr
} from 'stellar-sdk';

export function predicateFromHorizonResponse(horizonPredicate: Horizon.Predicate): xdr.ClaimPredicate;
export function isPredicateClaimableAt(claimPredicate: xdr.ClaimPredicate, claimingAtDate?: Date): boolean;
export function flattenPredicate(claimPredicate: xdr.ClaimPredicate, claimingAtDate?: Date): xdr.ClaimPredicate;
