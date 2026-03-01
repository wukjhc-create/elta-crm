-- Update Lemvigh-Müller website URL from fake API to real Classic Portal
UPDATE suppliers SET website = 'https://classic.lemu.dk' WHERE code = 'LM';
