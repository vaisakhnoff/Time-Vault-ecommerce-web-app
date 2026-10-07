const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload an in-memory image buffer to Cloudinary.
 * Returns a Promise that resolves to the upload result (contains secure_url, public_id, etc.).
 *
 * @param {Buffer} buffer   - the image data
 * @param {string} folder   - the Cloudinary folder to store the asset in
 * @param {object} options  - extra upload options (e.g. transformation)
 */
const uploadBuffer = (buffer, folder, options = {}) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image', ...options },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
};

module.exports = { cloudinary, uploadBuffer };
