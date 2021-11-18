# Resolve stellar ClaimPredicates
On the stellar network [ClaimableBalances](https://stellar.github.io/js-stellar-base/Claimant.html) can used to send 
funds to another wallet that does not have a trust-line established to a given asset, yet.
In addition to just sending funds, the validity can be limited using *predicates*.

These predicates consist of a time-constraint and can be nested using boolean operators (see
https://stellar.github.io/js-stellar-base/Claimant.html for details).  

The [js-stellar-sdk](https://stellar.github.io/js-stellar-sdk/) lacks methods to resolve any given
predicate to a specific timestamp.

This module aims at resolving claimable balance predicates to a specific timestamp so that stellar-clients
can check if a ClaimableBalance can be claimed. This can be used to filter out ClaimableBalances that are currently
not claimable (e.g. expired or not yet claimable).

