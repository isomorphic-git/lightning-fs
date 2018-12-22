# isomorphic-pgp

A lightweight library for creating and verifying OpenPGP signatures

## Motivation

PGP is the cryptographic standard used to sign git commits, and I wanted to provide `isomorphic-git` users a way
to tap into that power without sacrificing bundle size or worrying about LGPL restrictions.
So I wrote an entirely new JavaScript library with that narrow use case in mind.

## IMPORTANT!!!

Please read and understand the limitations of the [`sign-and-verify`](https://github.com/wmhilton/isomorphic-pgp/tree/master/src/sign-and-verify) module before using it.

## Comparison with other libraries

This library does not implement encryption or decryption - only signing and verifying signatures.

|   | Size | License | Sign | Verify | Encrypt | Decrypt |
|---|------|---------|------|--------|---------|---------|
| isomorphic-pgp | [~17 kb](https://bundlephobia.com/result?p=@isomorphic-git/pgp-plugin@0.0.7) | MIT | 🗹 | 🗹 | ☐ | ☐|
| OpenPGP.js | [~170 kb](https://bundlephobia.com/result?p=openpgp@4.2.1) | LGPL | 🗹 | 🗹 | 🗹 | 🗹 |
| kbpgp | [~160 kb](https://bundlephobia.com/result?p=kbpgp@2.0.82) | BSD |  🗹 | 🗹 | 🗹 | 🗹 |

## Usage

See individual READMEs for each package:

- [parser](https://github.com/wmhilton/isomorphic-pgp/tree/master/src/parser)
- [util](https://github.com/wmhilton/isomorphic-pgp/tree/master/src/util)
- [sign-and-verify](https://github.com/wmhilton/isomorphic-pgp/tree/master/src/sign-and-verify)
- [generate](https://github.com/wmhilton/isomorphic-pgp/tree/master/src/generate)

## License

MIT