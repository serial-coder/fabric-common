const fs = require('fs');
const path = require('path');
const fsExtra = require('fs-extra');
const logger = require('./logger').new('ca-core');
const CAClient = require('fabric-ca-client/lib/FabricCAClientImpl');

const FABRIC_CA_HOME = '/etc/hyperledger/fabric-ca-server';
exports.container = {
	FABRIC_CA_HOME,
	CONFIG: path.resolve(FABRIC_CA_HOME, 'fabric-ca-server-config.yaml'),
	caKey: path.resolve(FABRIC_CA_HOME, 'ca-key.pem'),
	caCert: path.resolve(FABRIC_CA_HOME, 'ca-cert.pem'),
	tlsCert: path.resolve(FABRIC_CA_HOME,'tls-cert.pem'),
};
exports.user = {
	register: (caService, {username, affiliation}, adminUser) =>
		registerIfNotExist(caService, {enrollmentID: username, affiliation, role: 'user'}, adminUser),
	toMSP: ({key, certificate, rootCertificate}, mspDir, {username, domain}) => {
		_toMSP({key, certificate, rootCertificate}, mspDir, {name: username, delimiter: '@', domain});
	},
	admin: {
		toMSP: ({key, certificate, rootCertificate}, mspDir, {adminName, domain}) => {
			const admincerts = path.join(mspDir, 'admincerts');
			fsExtra.ensureDirSync(admincerts);
			fs.writeFileSync(path.join(admincerts, `${adminName}@${domain}-cert.pem`), certificate);
			exports.user.toMSP({key, certificate, rootCertificate}, mspDir, {username: adminName, domain});
		}
	},

};
exports.peer = {
	/**
	 *
	 * @param key
	 * @param certificate
	 * @param rootCertificate
	 * @param mspDir
	 * @param peerName
	 * @param domain
	 */
	toMSP: ({key, certificate, rootCertificate}, mspDir, {peerName, domain}) => {
		_toMSP({key, certificate, rootCertificate}, mspDir, {name: peerName, delimiter: '.', domain});
	},
	toadmincerts: ({certificate}, mspDir, {username, domain}) => {
		const admincerts = path.resolve(mspDir, 'admincerts');
		fsExtra.ensureDirSync(admincerts);
		fs.writeFileSync(path.resolve(admincerts, `${username}@${domain}-cert.pem`), certificate);
	}
};
exports.intermediateCA = {
	register: (caService, {enrollmentID, affiliation}, adminUser) => {

		return caService.register({
			enrollmentID,
			affiliation: affiliation.toLowerCase(),
			role: 'client',
			maxEnrollments: -1,
			attrs: [{name: 'hf.IntermediateCA', value: 'true'}]
		}, adminUser);
	}

};
const registerIfNotExist = async (caService, {enrollmentID, enrollmentSecret, affiliation, role}, adminUser) => {
	try {
		const secret = await caService.register({
			enrollmentID,
			enrollmentSecret,
			role,
			maxEnrollments: -1,
			affiliation
		}, adminUser);
		if (!enrollmentSecret) {
			logger.info('new enrollmentSecret generated by ca service');
			return {enrollmentID, enrollmentSecret: secret, status: 'generated'};
		}
		else return {enrollmentID, enrollmentSecret, status: 'assigned'};
	} catch (err) {
		if (err.toString().includes('is already registered')) {
			return {enrollmentID, enrollmentSecret, status: 'existed'};
		} else {
			throw err;
		}
	}
};
const pkcs11_key = {
	generate: (cryptoSuite) => cryptoSuite.generateKey({ephemeral: !cryptoSuite._cryptoKeyStore}),
	toKeystore: (pkcs11_key, dirName) => {
		const filename = `${pkcs11_key._key.prvKeyHex}_sk`;
		const absolutePath = path.join(dirName, filename);
		fs.writeFileSync(absolutePath, pkcs11_key.toBytes());
		return absolutePath;
	},
	toServerKey: (pkcs11_key, dirName) => {
		const filename = 'server.key';
		const absolutePath = path.join(dirName, filename);
		fs.writeFileSync(absolutePath, pkcs11_key.toBytes());
		return absolutePath;
	}

};

const _toMSP = ({key, certificate, rootCertificate}, mspDirName, {name, delimiter, domain}) => {
	if (certificate) {
		const signcertsDir = path.resolve(mspDirName, 'signcerts');
		fsExtra.ensureDirSync(signcertsDir);
		fs.writeFileSync(path.resolve(signcertsDir, `${name}${delimiter}${domain}-cert.pem`), certificate);
	}
	if (key) {
		const keystoreDir = path.resolve(mspDirName, 'keystore');
		fsExtra.ensureDirSync(keystoreDir);
		pkcs11_key.toKeystore(key, keystoreDir);
	}
	if (rootCertificate) {
		const cacertsDir = path.resolve(mspDirName, 'cacerts');
		fsExtra.ensureDirSync(cacertsDir);
		fs.writeFileSync(path.resolve(cacertsDir, `ca.${domain}-cert.pem`), rootCertificate);
	}
};
exports.org = {
	toMSP: ({certificate, rootCertificate}, mspDir, {name, domain}) => {
		const cacertsDir = path.resolve(mspDir, 'cacerts');
		const admincertsDir = path.resolve(mspDir, 'admincerts');
		fsExtra.ensureDirSync(cacertsDir);
		fsExtra.ensureDirSync(admincertsDir);
		fs.writeFileSync(path.resolve(cacertsDir, `ca.${domain}-cert.pem`), rootCertificate);
		fs.writeFileSync(path.resolve(admincertsDir, `${name}@${domain}-cert.pem`), certificate);
	}
};
exports.toTLS = ({key, certificate, rootCertificate}, tlsDir) => {
	fsExtra.ensureDirSync(tlsDir);
	pkcs11_key.toServerKey(key, tlsDir);
	fs.writeFileSync(path.join(tlsDir, 'server.crt'), certificate);
	fs.writeFileSync(path.join(tlsDir, 'ca.crt'), rootCertificate);
};

exports.register = registerIfNotExist;
exports.new = (caUrl, trustedRoots = []) => {
	const tlsOptions = {
		trustedRoots,
		verify: trustedRoots.length > 0
	};
	return new CAClient(caUrl, tlsOptions);
};
exports.envBuilder = () => {
	return [
		'GODEBUG=netdns=go',
	];
};