export function resolveVaultPath(baseDir, reference) {
	const ref = String(reference ?? "").trim();
	if (!ref) throw new Error("Dataset reference must not be empty.");
	if (/[\0?#]/.test(ref))
		throw new Error(
			`Dataset reference "${ref}" contains unsupported characters.`,
		);
	if (ref.startsWith("/") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref)) {
		throw new Error(
			`Dataset reference "${ref}" must be a vault-relative path.`,
		);
	}
	const segments = [];
	for (const part of `${baseDir}/${ref}`.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			if (segments.length === 0)
				throw new Error(`Dataset reference "${ref}" escapes the vault.`);
			segments.pop();
		} else {
			segments.push(part);
		}
	}
	return segments.join("/");
}
