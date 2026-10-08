# Security

Never commit API keys, OAuth tokens, passwords, cookies, private keys,
authentication stores, actual settings/models files, sessions, signed URLs,
or device-private configuration. Keep credentials outside this checkout.

The publication uses an explicit file allowlist and a new Git history.
Private release/migration metadata and internal repository addresses are omitted.
Public repository URLs, package versions, integrity hashes and source revision
IDs are configuration/provenance metadata, not credentials.

Before updating, inspect every outgoing file and commit, not only the latest
working tree. Ignore rules alone cannot remove already tracked secrets.
The export scanner checks common credential patterns, internal paths/addresses,
and currently loaded secret environment values; it is not a guarantee against
every possible secret format.

If a credential is exposed, revoke/rotate it immediately. Deleting a file or
making a later commit does not revoke the credential or remove old history.
