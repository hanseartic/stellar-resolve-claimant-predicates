import {
    Claimant,
    Horizon,
    xdr
} from "stellar-sdk";
import BigNumber from "bignumber.js";

/**
 * Generate a `xdr.ClaimantPredicate` from horizon response (`Horizon.Predicate`)
 *
 * @param {Horizon.Predicate} horizonPredicate
 * @returns {xdr.ClaimPredicate}
 */
const predicateFromHorizonResponse = (horizonPredicate) => {
    let xdrPredicate = Claimant.predicateUnconditional();

    if (horizonPredicate.abs_before) xdrPredicate = Claimant.predicateBeforeAbsoluteTime(
        new BigNumber(Date.parse(horizonPredicate.abs_before)).idiv(1000).toString()
    );
    if (horizonPredicate.rel_before) xdrPredicate = Claimant.predicateBeforeRelativeTime(
        horizonPredicate.rel_before
    );
    if (horizonPredicate.and) xdrPredicate = Claimant.predicateAnd(
        predicateFromHorizonResponse(horizonPredicate.and[0]),
        predicateFromHorizonResponse(horizonPredicate.and[1])
    );
    if (horizonPredicate.or) xdrPredicate = Claimant.predicateOr(
        predicateFromHorizonResponse(horizonPredicate.or[0]),
        predicateFromHorizonResponse(horizonPredicate.or[1])
    );
    if (horizonPredicate.not) xdrPredicate = Claimant.predicateNot(
        predicateFromHorizonResponse(horizonPredicate.not)
    );

    return xdrPredicate;
}

/**
 * Evaluate if a predicate is claimable at a given time
 * @param {xdr.ClaimPredicate} claimPredicate
 * @param {Date} [claimingAtDate]
 * @returns {boolean}
 */
const isPredicateClaimableAt = (claimPredicate, claimingAtDate = new Date()) => {
    const claimingAtSeconds = new BigNumber(claimingAtDate.getTime()).idiv(1000).toNumber();
    switch (claimPredicate.switch()) {
        case xdr.ClaimPredicateType.claimPredicateUnconditional():
            return true;

        case xdr.ClaimPredicateType.claimPredicateAnd():
            return isPredicateClaimableAt(claimPredicate.andPredicates()[0], claimingAtDate)
                && isPredicateClaimableAt(claimPredicate.andPredicates()[1], claimingAtDate);

        case xdr.ClaimPredicateType.claimPredicateOr():
            return isPredicateClaimableAt(claimPredicate.orPredicates()[0], claimingAtDate)
                || isPredicateClaimableAt(claimPredicate.orPredicates()[1], claimingAtDate);

        case xdr.ClaimPredicateType.claimPredicateNot():
            return !isPredicateClaimableAt(claimPredicate.notPredicate(), claimingAtDate);

        case xdr.ClaimPredicateType.claimPredicateBeforeAbsoluteTime():
            return new BigNumber(claimPredicate.absBefore().toString())
                .isGreaterThan(claimingAtSeconds);

        case xdr.ClaimPredicateType.claimPredicateBeforeRelativeTime():
            // add the relative time given in seconds to current timestamp for estimation
            const absPredicateTime = new BigNumber(claimPredicate.relBefore())
                .plus(new BigNumber(Date.now()).idiv(1000));
            return absPredicateTime
                .isGreaterThan(claimingAtSeconds);
    }

    return true;
}

/**
 * Flatten a nested predicate and ignore all conditions that don't apply to 'claimingAtDate'
 *
 * @param {xdr.ClaimPredicate} claimPredicate
 * @param {Date} [claimingAtDate]
 * @returns {xdr.ClaimPredicate}
 */
const flattenPredicate = (claimPredicate, claimingAtDate = new Date()) => {
    const claimAtSeconds = new BigNumber(claimingAtDate.getTime()).idiv(1000).toNumber();
    switch(claimPredicate.switch()) {
        case xdr.ClaimPredicateType.claimPredicateUnconditional():
            break;

        case xdr.ClaimPredicateType.claimPredicateNot():
            return xdr.ClaimPredicate.claimPredicateNot(flattenPredicate(claimPredicate.notPredicate()));

        case xdr.ClaimPredicateType.claimPredicateBeforeAbsoluteTime():
            return claimPredicate;

        case xdr.ClaimPredicateType.claimPredicateBeforeRelativeTime():
            return flattenPredicate(Claimant.predicateBeforeAbsoluteTime(
                new BigNumber(claimPredicate.relBefore())
                    .plus(claimAtSeconds)
                    .toString()
            ), claimingAtDate);

        case xdr.ClaimPredicateType.claimPredicateOr():
            return flattenPredicateOr(claimPredicate, claimingAtDate);

        case xdr.ClaimPredicateType.claimPredicateAnd():
            return flattenPredicateAnd(claimPredicate, claimingAtDate);
    }
    return xdr.ClaimPredicate.claimPredicateUnconditional();
}

const flattenPredicateAnd = (claimPredicate, claimingAtDate) => {
    const flatPredicates = claimPredicate.andPredicates().map(p => flattenPredicate(p, claimingAtDate));
    const claimablePredicates = flatPredicates.filter(p => isPredicateClaimableAt(p, claimingAtDate));
    if (claimablePredicates.length === 0) {
        let relevant = getLatestBeforeAbsolutePredicate(flatPredicates.filter(isAbsBeforePredicate));
        if (!relevant)
            relevant = getEarliestNotBeforeAbsolutePredicate(flatPredicates.filter(isNotPredicate));
        if (!relevant)
            Claimant.predicateNot(Claimant.predicateUnconditional());
        return relevant;
    } else if (claimablePredicates.length === 1) {
        return flatPredicates.find(p => !isPredicateClaimableAt(p));
    } else {
        const expiringPredicates = flatPredicates.filter(isAbsBeforePredicate);
        const validFromPredicates = flatPredicates.filter(isNotPredicate);
        if (claimablePredicates.find(isUnconditionalPredicate)
            || validFromPredicates.length === 2
            || expiringPredicates.length === 2) {
                let relevant = getEarliestBeforeAbsolutePredicate(expiringPredicates);
                if (!relevant)
                    relevant = getLatestNotBeforeAbsolutePredicate(validFromPredicates);
                if (!relevant)
                    relevant =  Claimant.predicateUnconditional();
                return relevant;
        }
    }
    return claimPredicate;
};

const flattenPredicateOr = (claimPredicate, claimingAtDate) => {
    const predicates = claimPredicate.orPredicates().map(p => flattenPredicate(p, claimingAtDate));
    if (predicates.find(isUnconditionalPredicate)) {
        return Claimant.predicateUnconditional();
    }
    const claimablePredicates = predicates.filter(p => isPredicateClaimableAt(p, claimingAtDate));
    if (claimablePredicates.length === 0) {
        let relevant = getLatestNotBeforeAbsolutePredicate(predicates.filter(isNotPredicate));
        if (!relevant)
            relevant = getLatestBeforeAbsolutePredicate(predicates.filter(isAbsBeforePredicate));
        if (!relevant)
            relevant = Claimant.predicateOr(...predicates);
        return relevant;
    } else if (claimablePredicates.length === 1) {
        return claimablePredicates[0];
    } else {
        let relevant = getLatestBeforeAbsolutePredicate(claimablePredicates);
        if (!relevant)
            relevant = getEarliestNotBeforeAbsolutePredicate(claimablePredicates);
        if (relevant) return relevant;
    }
    return Claimant.predicateUnconditional();
}

const isUnconditionalPredicate = (claimPredicate) => {
    if (claimPredicate.switch)
        return claimPredicate.switch() === xdr.ClaimPredicateType.claimPredicateUnconditional();
};
const isAbsBeforePredicate = (claimPredicate) => {
    if (claimPredicate.switch)
        return claimPredicate.switch() === xdr.ClaimPredicateType.claimPredicateBeforeAbsoluteTime();
};
const isNotPredicate = (claimPredicate) => {
    if (claimPredicate.switch)
        return claimPredicate.switch() === xdr.ClaimPredicateType.claimPredicateNot();
};
const predicatesAreTheSameType = claimablePredicates => claimablePredicates
    .map(p => p.switch()).filter((value, index, self) =>
        self.indexOf(value) === index
    ).length === 1;


/**
 * For any given number of `{@link xdr.ClaimPredicate}`s of `{@link xdr.ClaimPredicateType}` 'claimPredicateBeforeAbsoluteTime'
 * return the latest one.
 * @param {xdr.ClaimPredicate[]} claimPredicates
 * @returns {xdr.ClaimPredicate|undefined}
 */
const getLatestBeforeAbsolutePredicate = (claimPredicates) => {
    if (predicatesAreTheSameType(claimPredicates)) {
        if (isAbsBeforePredicate(claimPredicates[0])) {
            return Claimant.predicateBeforeAbsoluteTime(
                claimPredicates
                    .map(p => p.value())
                    // if there is a number => through recursive flattening it's from an absolute predicate
                    .filter(v => v instanceof xdr.Int64)
                    .reduce((p, c) => Math.max(p, c), 0).toString()
            );
        }
    }
}

/**
 * For any given number of `{@link xdr.ClaimPredicate}`s of `{@link xdr.ClaimPredicateType}` 'claimPredicateNot(claimPredicateBeforeAbsoluteTime)'
 * return the latest one.
 * @param {xdr.ClaimPredicate[]} claimPredicates
 * @returns {xdr.ClaimPredicate|undefined}
 */
const getLatestNotBeforeAbsolutePredicate = (claimPredicates) => {
    if (predicatesAreTheSameType(claimPredicates)) {
        if (isNotPredicate(claimPredicates[0])) {
            return Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(
                claimPredicates
                    .map(p => p.notPredicate().value())
                    // if there is a number => through recursive flattening it's from an absolute predicate
                    .filter(v => v instanceof xdr.Int64)
                    .reduce((p, c) => Math.max(p, c), 0).toString()
            ));
        }
    }
}

/**
 * For any given number of `{@link xdr.ClaimPredicate}`s of `{@link xdr.ClaimPredicateType}` 'claimPredicateBeforeAbsoluteTime'
 * return the earliest one.
 * @param {xdr.ClaimPredicate[]} claimPredicates
 * @returns {xdr.ClaimPredicate|undefined}
 */
const getEarliestBeforeAbsolutePredicate = (claimPredicates) => {
    if (predicatesAreTheSameType(claimPredicates)) {
        if (isAbsBeforePredicate(claimPredicates[0])) {
            return Claimant.predicateBeforeAbsoluteTime(
                claimPredicates
                    .map(p => p.value())
                    // if there is a number => through recursive flattening it's from an absolute predicate
                    .filter(v => v instanceof xdr.Int64)
                    .reduce((p, c) => Math.min(p, c), Number.POSITIVE_INFINITY).toString()
            );
        }
    }
}

/**
 * For any given number of `{@link xdr.ClaimPredicate}`s of `{@link xdr.ClaimPredicateType}` 'claimPredicateNot(claimPredicateBeforeAbsoluteTime)'
 * return the earliest one.
 * @param {xdr.ClaimPredicate[]} claimPredicates
 * @returns {xdr.ClaimPredicate|undefined}
 */
const getEarliestNotBeforeAbsolutePredicate = (claimPredicates) => {
    if (predicatesAreTheSameType(claimPredicates)) {
        if (isNotPredicate(claimPredicates[0])) {
            return Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(
                claimPredicates
                    .map(p => p.notPredicate().value())
                    // if there is a number => through recursive flattening it's from an absolute predicate
                    .filter(v => v instanceof xdr.Int64)
                    .reduce((p, c) => Math.min(p, c), Number.POSITIVE_INFINITY).toString()
            ));
        }
    }
}

/**
 * Get information about a claimable balance predicate evaluated at a given time.
 *
 * @param {xdr.ClaimPredicate} claimPredicate
 * @param {Date} [claimingAtDate]
 * @return {PredicateInformation} `{status: 'claimable'|'expired'|'upcoming', predicate: xdr.ClaimPredicate, validFrom: number, validTo: number}`
 */
const getPredicateInformation = (claimPredicate, claimingAtDate) => {
    const flatPredicate = flattenPredicate(claimPredicate, claimingAtDate);
    const information = {
        predicate: flatPredicate,
        validFrom: undefined,
        validTo: undefined,
    };

    const getValidTo = (currentPredicate) => isAbsBeforePredicate(currentPredicate)
        ? new BigNumber(currentPredicate.absBefore()).toNumber()
        : undefined;
    const getValidFrom = (currentPredicate) => (isNotPredicate(currentPredicate) && isAbsBeforePredicate(currentPredicate.notPredicate()))
        ? new BigNumber(currentPredicate.notPredicate().value()).toNumber()
        : undefined;
    const getRange = (currentPredicate) => ({
        validFrom: getValidFrom(currentPredicate),
        validTo: getValidTo(currentPredicate),
    });

    const isClaimable = isPredicateClaimableAt(flatPredicate, claimingAtDate);
    const {validFrom, validTo} = getRange(flatPredicate);
    if (isClaimable) {
        information.status = 'claimable';
        if (flatPredicate.switch() === xdr.ClaimPredicateType.claimPredicateAnd()) {
            let range = flatPredicate.andPredicates()
                .map(getRange)
                .reduce((p, c) => {
                    let validFrom = c.validFrom;
                    if (!validFrom) validFrom = p.validFrom;
                    let validTo = c.validTo;
                    if (!validTo) validTo = p.validTo;
                    return {validFrom, validTo,};
                }, {});
            information.validTo = range.validTo;
            information.validFrom = range.validFrom;
        }
    } else {
        if (validTo) {
            information.validTo = validTo;
            information.status = 'expired';
        } else if (validFrom) {
            information.validFrom = validFrom;
            information.status = 'upcoming';
        }
    }
    return information;
}

export {
    flattenPredicate,
    getPredicateInformation,
    isPredicateClaimableAt,
    predicateFromHorizonResponse,
};
