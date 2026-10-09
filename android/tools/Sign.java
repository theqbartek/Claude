import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/**
 * Podpisuje APK kluczem z pliku keystore (biblioteka apksig) i weryfikuje wynik.
 * Użycie: java -cp apksig.jar:. Sign <keystore> <hasło> <alias> <wejście.apk> <wyjście.apk>
 */
public class Sign {
    public static void main(String[] args) throws Exception {
        File keystoreFile = new File(args[0]);
        char[] password = args[1].toCharArray();
        String alias = args[2];
        File in = new File(args[3]);
        File out = new File(args[4]);

        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream fis = new FileInputStream(keystoreFile)) {
            ks.load(fis, password);
        }
        PrivateKey key = (PrivateKey) ks.getKey(alias, password);
        X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

        ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder(
                "CERT", key, Collections.singletonList(cert)).build();

        new ApkSigner.Builder(Collections.singletonList(signer))
                .setInputApk(in)
                .setOutputApk(out)
                .setMinSdkVersion(24)
                .setV1SigningEnabled(false) // v1 niepotrzebny od Androida 7 (minSdk 24)
                .setV2SigningEnabled(true)
                .build()
                .sign();

        ApkVerifier.Result result = new ApkVerifier.Builder(out).build().verify();
        if (!result.isVerified()) {
            System.err.println("Weryfikacja podpisu NIEUDANA: " + result.getErrors());
            System.exit(1);
        }
        System.out.println("Podpis OK (v1: " + result.isVerifiedUsingV1Scheme()
                + ", v2: " + result.isVerifiedUsingV2Scheme() + ")");
    }
}
