# Resolve stellar ClaimPredicates
[![Tests](https://github.com/hanseartic/stellar-resolve-claimant-predicates/actions/workflows/test.yml/badge.svg?branch=develop)](https://github.com/hanseartic/stellar-resolve-claimant-predicates/actions/workflows/test.yml) ![GitHub package.json version (develop)](https://img.shields.io/github/package-json/v/hanseartic/stellar-resolve-claimant-predicates/develop?label=%40[develop])

[![Publish to npm](https://github.com/hanseartic/stellar-resolve-claimant-predicates/actions/workflows/npm.yml/badge.svg?branch=main&event=push)](https://www.npmjs.com/package/stellar-resolve-claimant-predicates) ![NPM version](https://img.shields.io/npm/v/stellar-resolve-claimant-predicates?label=%40)


On the stellar network [ClaimableBalances](https://stellar.github.io/js-stellar-base/Claimant.html) can used to send 
funds to another wallet that does not have a trust-line established to a given asset, yet.
In addition to just sending funds, the validity can be limited using *predicates*.

These predicates are described by a time-constraint and can be nested using boolean operators (see
https://stellar.github.io/js-stellar-base/Claimant.html for details).  

The [js-stellar-sdk](https://stellar.github.io/js-stellar-sdk/) lacks methods to resolve any given
predicate to a specific timestamp.

This module aims at resolving claimable balance predicates to a specific timestamp so that stellar-clients
can check if a ClaimableBalance can be claimed at a given time (i.e. when displaying).
This can be used to filter out ClaimableBalances that are currently not claimable (e.g. expired or not yet claimable).

## Usage

### Installation

    npm install -S stellar-resolve-claimant-predicates

----
### Convert horizon response to `xdr.ClaimPredicate`
When querying horizon for claimable balances, the response is less easy to parse and process than the
`xdr.ClaimPredicate` objects. For further processing just convert the response back to `xdr.ClaimPredicate` objects:

    const { predicateFromHorizonResponse } = require('stellar-resolve-claimant-predicates');
    server.claimableBalances
      .claimant('GB7U....NMRQ')
      .call()
      .then(({records}) => records.map(r => ({
        ...r,
        claimants: r.claimants
          // here the predicate is mapped from horizon-response format to xdr.ClaimPredicate
          .map(c => ({...c, predicate: predicateFromHorizonResponse(c.predicate)})
      })))
      .then(records => {
          // have the xdr.ClaimPredicates available inside the response here 
      });

The code above will replace the `Horizon.Predicate` data with `xdr.ClaimPredicate` data inside the response. 

### Getting information on a certain predicate
The `PredicateInformation` holds the information necessary to determine if a predicate can be claimed.
The `status` field makes determination easy. `validFrom` & `validTo` only hold values if the original predicate defined
'before' (i.e. `predicateBeforeAbsoluteTime(...)`) or 'after' (i.e. `predicateNot(predicateBeforeAbsoluteTime(...))`) times.

    {
        status: 'claimable' | 'expired' | 'upcoming';
        predicate: xdr.ClaimPredicate,
        validFrom?: number,
        validTo?: number,
    }

To retrieve the information object simply call `getPredicateInformation()` with the predicate and optionally
a `Date` object as of when the claimable balance is supposed to be claimed:

    const info = getPredicateInformation(xdrClaimPredicate, new Date());

### Resolve a predicate to a timestamp
Predicates can potentially cover different time-slots when a claimable balance is claimable.
`flattenPredicate()` resolves the nested structure of predicates to a given timestamp (e.g. now)
for easy inspection by leaving out irrelevant predicates. For example a predicate defining a claimable window of one hour can be resolved
to three different predicates:

    const beginOfClaimWindowPredicate = Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime("1637017200"));
    const endOfClaimWindowPredicate = Claimant.predicateBeforeAbsoluteTime("1637020800");

    // this defines a claimable time window of one hour
    const claimPredicate = Claimant.predicateAnd(beginOfClaimWindowPredicate, endOfClaimWindowPredicate);

    // a second before the claimable time window the predicate will be resolved only to the starting time 
    flattenPredicate(claimPredicate, new Date(1637017199)) === beginOfClaimWindowPredicate;
    
    // within the claimable time window the predicate will be resoved as is
    flattenPredicate(claimPredicate, new Date(1637019000)) === claimPredicate;

    // a second after the claimable time window the predicate will be resolved to the predicate describing the end
    // of the claimable window only, as the start-time is irrelevant for an expired predicate
    flattenPredicate(claimPredicate, new Date(1637020801)) === endOfClaimWindowPredicate;


## Tests
To run the tests, simply execute them via `npm`:

    npm test
