Here is an informal list of invariants that we should consider enforcing.

1. acyclic graph of parts (cycles are invalid here)
2. unique package name/version pairs
3. cannot republish an unpublished/deleted name/version pairs
    - perhaps we can allow identical content to be republished
4. names should be valid unicode
    - normalized to UTF-8 (pick normal form internally for consistency)
