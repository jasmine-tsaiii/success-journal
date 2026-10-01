// 驗證解鎖碼用的公鑰（ECDSA P-256，JWK 格式）。
// 公鑰可以公開；對應的私鑰只存在 Jasmine 的發碼頁（issuer.html）裡，不會放進程式碼。
// 換金鑰時，把新的公鑰加在陣列最前面；舊的公鑰保留，已發出的解鎖碼才不會失效。
export const PUBLIC_KEYS = [];
