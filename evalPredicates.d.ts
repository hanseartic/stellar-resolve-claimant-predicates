import {
    Horizon,
    xdr
} from 'stellar-sdk';

export function predicateFromHorizonResponse(horizonPredicate: Horizon.Predicate): xdr.ClaimPredicate;
export function isPredicateClaimableAt(claimPredicate: xdr.ClaimPredicate, claimingAtDate?: Date): boolean;
export function flattenPredicate(claimPredicate: xdr.ClaimPredicate, claimingAtDate?: Date): xdr.ClaimPredicate;
export function getPredicateInformation(claimPredicate: xdr.ClaimPredicate, claimingAtDate?: Date): PredicateInformation;
export interface PredicateInformation {
    status: 'claimable' | 'expired' | 'upcoming';
    predicate: xdr.ClaimPredicate,
    validFrom?: number,
    validTo?: number,
}
