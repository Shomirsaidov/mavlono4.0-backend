const { v2: cloudinary } = require('cloudinary');

/**
 * Uploads a file (Base64 or URL) to Cloudinary.
 * @param {string} file - Base64 string or image URL.
 * @param {object} options - Cloudinary upload options (e.g., folder).
 * @returns {Promise<{url: string, public_id: string}>}
 */
async function uploadToCloudinary(file, options = {}) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(file, options, (error, result) => {
            if (error) return reject(error);
            resolve({
                url: result.secure_url,
                public_id: result.public_id
            });
        });
    });
}

/**
 * Deletes an asset from Cloudinary using its public_id.
 * @param {string} public_id - The public ID of the asset.
 * @returns {Promise<any>}
 */
async function deleteFromCloudinary(public_id) {
    if (!public_id) return null;
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(public_id, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
    });
}

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary
};
