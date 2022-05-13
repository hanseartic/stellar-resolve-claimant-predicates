import {Claimant} from "stellar-sdk";
import {
    getPredicateInformation,
    isPredicateClaimableAt,
    flattenPredicate,
    predicateFromHorizonResponse
} from './evalPredicates';
import BigNumber from "bignumber.js";


const claimingAtDate = Date.now();
const claimingAtSeconds = new BigNumber(claimingAtDate).idiv(1000).toNumber();
// not claimable anymore since five seconds
const expiredPredicate = Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds-5).toString());
// claimable for another five seconds
const validBeforeClaimingAtPredicate = Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds+5).toString());
// claimable since five seconds
const validAfterClaimingAtPredicate = Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds-5).toString()));
// will be claimable in five seconds
const upcomingPredicate = Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds+5).toString()));


describe("Test 'predicateFromHorizonResponse'", () => {
    test("maps unconditional claim predicate from horizon", () => {
        expect(predicateFromHorizonResponse({}))
            .toStrictEqual(Claimant.predicateUnconditional());
    })
    test("maps 'abs_before' claim predicate from horizon", () => {
        const now = new Date();
        const nowSeconds = parseInt(now.getTime()/1000);
        expect(predicateFromHorizonResponse({abs_before: now.toISOString()}))
            .toStrictEqual(Claimant.predicateBeforeAbsoluteTime(nowSeconds.toString()));
    })
    test("maps 'rel_before' claim predicate from horizon", () => {
        expect(predicateFromHorizonResponse({rel_before: "3600"}))
            .toStrictEqual(Claimant.predicateBeforeRelativeTime("3600"));
    })
    test("maps 'not' claim predicate from horizon", () => {
        expect(predicateFromHorizonResponse({not: {rel_before: "3600"}}))
            .toStrictEqual(Claimant.predicateNot(Claimant.predicateBeforeRelativeTime("3600")));
    })
    test("maps 'or' claim predicate from horizon", () => {
        expect(predicateFromHorizonResponse({or: [{}, {not: {}}]}))
            .toStrictEqual(Claimant.predicateOr(
                Claimant.predicateUnconditional(),
                Claimant.predicateNot(Claimant.predicateUnconditional()))
            );
    })
    test("maps 'and' claim predicate from horizon", () => {
        expect(predicateFromHorizonResponse({and: [{}, {not: {rel_before: "3600"}}]}))
            .toStrictEqual(Claimant.predicateAnd(
                Claimant.predicateUnconditional(),
                Claimant.predicateNot(Claimant.predicateBeforeRelativeTime("3600")))
            );
    })
});

describe("Test 'isPredicateClaimableAt'", () => {
    test('unconditional is claimable', () => {
        expect(isPredicateClaimableAt(Claimant.predicateUnconditional()))
            .toBe(true)
    });
    test('relative to now is claimable', () => {
        expect(isPredicateClaimableAt(Claimant.predicateBeforeRelativeTime("3600")))
            .toBe(true);
        expect(isPredicateClaimableAt(Claimant.predicateBeforeRelativeTime("3600"), new Date(claimingAtDate)))
            .toBe(true);
    });
    test('relative to not now is not claimable', () => {
        expect(isPredicateClaimableAt(Claimant.predicateNot(Claimant.predicateBeforeRelativeTime("3600")), new Date((claimingAtSeconds+3601)*1000)))
            .toBe(true);
    });
    test('relative to hour in the future is not claimable a second after the hour', () => {
        expect(isPredicateClaimableAt(Claimant.predicateBeforeRelativeTime("3600"), new Date((claimingAtSeconds+3601)*1000)))
            .toBe(false);
    });
    test('relative to hour in the future is claimable a second after the hour', () => {
        expect(isPredicateClaimableAt(Claimant.predicateNot(Claimant.predicateBeforeRelativeTime("3600")), new Date((claimingAtSeconds+3601)*1000)))
            .toBe(true);
    });
    test("'before absolute' is claimable before given time", () => {
        expect(isPredicateClaimableAt(validBeforeClaimingAtPredicate, new Date(claimingAtDate)))
            .toBe(true);
    });
    test("'not before absolute' is not claimable before given time (upcoming)", () => {
        expect(isPredicateClaimableAt(upcomingPredicate, new Date(claimingAtDate)))
            .toBe(false);
    });
    test("'before absolute' is not claimable at given time (expired)", () => {
        expect(isPredicateClaimableAt(expiredPredicate, new Date(claimingAtDate)))
            .toBe(false);
    });
    test("'not absolute before' is claimable at given time", () => {
        expect(isPredicateClaimableAt(validAfterClaimingAtPredicate, new Date(claimingAtDate)))
            .toBe(true);
    });
    test("'and' is claimable only when both predicates are claimable", () => {
        expect(isPredicateClaimableAt(Claimant.predicateAnd(Claimant.predicateUnconditional(), Claimant.predicateUnconditional())))
            .toBe(true);
        expect(isPredicateClaimableAt(Claimant.predicateAnd(Claimant.predicateUnconditional(), Claimant.predicateNot(Claimant.predicateUnconditional()))))
            .toBe(false);
    });
    test("'or predicate is claimable with at least one truthy predicate", () => {
        expect(isPredicateClaimableAt(Claimant.predicateOr(Claimant.predicateUnconditional(), Claimant.predicateUnconditional())))
            .toBe(true);
        expect(isPredicateClaimableAt(Claimant.predicateOr(Claimant.predicateUnconditional(), Claimant.predicateNot(Claimant.predicateUnconditional()))))
            .toBe(true);
        expect(isPredicateClaimableAt(Claimant.predicateOr(Claimant.predicateNot(Claimant.predicateUnconditional()), Claimant.predicateNot(Claimant.predicateUnconditional()))))
            .toBe(false);
    });
});

describe("Test 'flattenPredicate'", () => {
    describe('generic', () => {
        test('unconditional', () => {
            expect(flattenPredicate(Claimant.predicateUnconditional()))
                .toStrictEqual(Claimant.predicateUnconditional());
        });
        test('not unconditional', () => {
            expect(flattenPredicate(Claimant.predicateNot(Claimant.predicateUnconditional())))
                .toStrictEqual(Claimant.predicateNot(Claimant.predicateUnconditional()));
        });
        test('valid since', () => {
            expect(flattenPredicate(validAfterClaimingAtPredicate))
                .toStrictEqual(validAfterClaimingAtPredicate);
        });
        test('before absolute', () => {
            expect(flattenPredicate(expiredPredicate, new Date(claimingAtDate)))
                .toStrictEqual(expiredPredicate);
        });
        test('before relative', () => {
            expect(flattenPredicate(Claimant.predicateBeforeRelativeTime("5"), new Date(claimingAtDate)))
                .toStrictEqual(validBeforeClaimingAtPredicate);
        });
    });

    describe('and', () => {
        test('both unconditional => unconditional', () => {
            expect(flattenPredicate(Claimant.predicateAnd(
                Claimant.predicateUnconditional(),
                Claimant.predicateUnconditional()
            ), new Date(claimingAtDate)))
                .toStrictEqual(Claimant.predicateUnconditional());
        });
        test('expired and unconditional => expired', () => {
            expect(flattenPredicate(Claimant.predicateAnd(
                expiredPredicate,
                Claimant.predicateUnconditional()
            ), new Date(claimingAtDate)))
                .toStrictEqual(expiredPredicate);
        });
        test('expired and expiring in the future => expired', () => {
            expect(flattenPredicate(Claimant.predicateAnd(
                expiredPredicate,
                validBeforeClaimingAtPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(expiredPredicate);
        });
        test('expired and upcoming => expired', () => {
            expect(flattenPredicate(Claimant.predicateAnd(
                expiredPredicate,
                upcomingPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(expiredPredicate);
        });
        test('expiring in future and unconditional => expiring', () => {
            expect(flattenPredicate(Claimant.predicateAnd(
                validBeforeClaimingAtPredicate,
                Claimant.predicateUnconditional()
            ), new Date(claimingAtDate)))
                .toStrictEqual(validBeforeClaimingAtPredicate);
        });
        test('expiring in future with different dates => earlier expiry', () => {
            const expiringEarlier = Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds+2).toString());
            expect(flattenPredicate(Claimant.predicateAnd(
                validBeforeClaimingAtPredicate,
                expiringEarlier
            ), new Date(claimingAtDate)))
                .toStrictEqual(expiringEarlier);
        });
        test('valid since different timestamp => later validity', () => {
            const validLater = Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds-2).toString()));
            expect(flattenPredicate(Claimant.predicateAnd(
                validAfterClaimingAtPredicate,
                validLater
            ), new Date(claimingAtDate)))
                .toStrictEqual(validLater);
        });
        test('currently valid between expiring in future => both', () => {
            const predicate = Claimant.predicateAnd(
                validBeforeClaimingAtPredicate,
                validAfterClaimingAtPredicate
            );
            expect(flattenPredicate(predicate, new Date(claimingAtDate)))
                .toStrictEqual(predicate)
        });
        test('valid in the future expiring even later => upcoming', () => {
            const expiringAfterClaimable = Claimant.predicateBeforeAbsoluteTime((claimingAtDate+1500).toString());
            const predicate = Claimant.predicateAnd(
                expiringAfterClaimable,
                upcomingPredicate
            );
            expect(flattenPredicate(predicate, new Date(claimingAtDate)))
                .toStrictEqual(upcomingPredicate);
        });
    });

    describe('or', () => {
        test('validBefore or validAfter => unconditional', () => {
            expect(flattenPredicate(Claimant.predicateOr(
                validAfterClaimingAtPredicate,
                validBeforeClaimingAtPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(Claimant.predicateUnconditional());
        });
        test('any or unconditional => unconditional', () => {
            expect(flattenPredicate(Claimant.predicateOr(
                Claimant.predicateUnconditional(),
                expiredPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(Claimant.predicateUnconditional());
        });
        test('expired or valid => valid', () => {
            expect(flattenPredicate(Claimant.predicateOr(
                validBeforeClaimingAtPredicate,
                expiredPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(validBeforeClaimingAtPredicate);
            expect(flattenPredicate(Claimant.predicateOr(
                expiredPredicate,
                validAfterClaimingAtPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(validAfterClaimingAtPredicate);
        });
        test('expired or upcoming => upcoming', () => {
           expect(flattenPredicate(Claimant.predicateOr(
               upcomingPredicate,
               expiredPredicate
           ), new Date(claimingAtDate)))
               .toStrictEqual(upcomingPredicate);
        });
        test('expired or expired => later expiry', () => {
            const earlierExpiredPredicate = Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds-10).toString())
            expect(flattenPredicate(Claimant.predicateOr(
                earlierExpiredPredicate,
                expiredPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(expiredPredicate);
        });
        test('valid or upcoming => valid', () => {
           expect(flattenPredicate(Claimant.predicateOr(
               upcomingPredicate,
               validAfterClaimingAtPredicate
           ), new Date(claimingAtDate)))
               .toStrictEqual(validAfterClaimingAtPredicate);
           expect(flattenPredicate(Claimant.predicateOr(
               upcomingPredicate,
               validBeforeClaimingAtPredicate
           ), new Date(claimingAtDate)))
               .toStrictEqual(validBeforeClaimingAtPredicate);
        });
        test('valid or valid (both having start-date) => earlier validity', () => {
            const laterValidAfterClaimingAtPredicate = Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds-2).toString()));
            expect(flattenPredicate(Claimant.predicateOr(
                validAfterClaimingAtPredicate,
                laterValidAfterClaimingAtPredicate
            ), new Date(claimingAtDate)))
                .toStrictEqual(validAfterClaimingAtPredicate);
        });
        test('valid or valid (both expiring in future) => later expiry', () => {
            const earlierExpiryDate = Claimant.predicateBeforeAbsoluteTime((claimingAtSeconds+2).toString());
            expect(flattenPredicate(Claimant.predicateOr(
                validBeforeClaimingAtPredicate,
                earlierExpiryDate
            ), new Date(claimingAtDate)))
                .toStrictEqual(validBeforeClaimingAtPredicate);
        });
    });
});

describe("Test 'getPredicateInformation", () => {
    test('unconditional', () => {
        expect(getPredicateInformation(Claimant.predicateUnconditional(), new Date(claimingAtDate)))
            .toStrictEqual({
                predicate: Claimant.predicateUnconditional(),
                status: 'claimable',
                validFrom: undefined,
                validTo: undefined,
            });
    });
    test('currently claimable within range',() => {
        const predicate = Claimant.predicateAnd(
            validAfterClaimingAtPredicate,
            validBeforeClaimingAtPredicate
        );
        expect(getPredicateInformation(predicate, new Date(claimingAtDate)))
            .toStrictEqual({
                predicate: predicate,
                status: 'claimable',
                validTo: claimingAtSeconds+5,
                validFrom: claimingAtSeconds-5,
            })
    });
    test('expired predicate', () => {
        expect(getPredicateInformation(expiredPredicate, new Date(claimingAtDate)))
            .toStrictEqual({
                predicate: expiredPredicate,
                status: 'expired',
                validTo: claimingAtSeconds-5,
                validFrom: undefined,
            })
    });
    test('claimable since 5 seconds', () => {
        expect(getPredicateInformation(validAfterClaimingAtPredicate, new Date(claimingAtDate)))
            .toStrictEqual({
                predicate: validAfterClaimingAtPredicate,
                status: 'claimable',
                validFrom: claimingAtSeconds-5,
                validTo: undefined,
            });
    });
    test('claimable in the future predicate', () => {
        expect(getPredicateInformation(upcomingPredicate, new Date(claimingAtDate)))
            .toStrictEqual({
                predicate: upcomingPredicate,
                status: 'upcoming',
                validFrom: claimingAtSeconds+5,
                validTo: undefined,
            })
    });
    test('expired but also claimable in the future predicate', () => {
        expect(getPredicateInformation(Claimant.predicateOr(
            upcomingPredicate,
            expiredPredicate
        ), new Date(claimingAtDate)))
            .toStrictEqual({
                predicate: upcomingPredicate,
                status: 'upcoming',
                validFrom: claimingAtSeconds+5,
                validTo: undefined,
            })
    });
});
