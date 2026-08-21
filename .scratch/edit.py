import io

def patch(path, pairs):
    with io.open(path, encoding="utf-8") as f:
        src = f.read()
    for old, new in pairs:
        n = src.count(old)
        if n != 1:
            raise SystemExit("MATCHES=%d for %r in %s" % (n, old[:90], path))
        src = src.replace(old, new)
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    print("patched", path, len(pairs))
