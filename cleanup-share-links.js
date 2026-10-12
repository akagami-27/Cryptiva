require('dotenv').config();

const mongoose = require('mongoose');
const ShareLink = require('./models/shareLink');

async function cleanupDuplicateShareLinks() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined.');
        }

        await mongoose.connect(process.env.MONGODB_URI);

        console.log('Connected to MongoDB Atlas.');
        console.log('Checking for duplicate share links...');

        const duplicates = await ShareLink.aggregate([
            {
                $sort: {
                    fileId: 1,
                    createdAt: 1
                }
            },
            {
                $group: {
                    _id: '$fileId',
                    ids: {
                        $push: '$_id'
                    },
                    count: {
                        $sum: 1
                    }
                }
            },
            {
                $match: {
                    count: {
                        $gt: 1
                    }
                }
            }
        ]);

        if (duplicates.length === 0) {
            console.log('No duplicate share links found.');
            return;
        }

        let deletedCount = 0;

        for (const duplicate of duplicates) {
            const idsToDelete = duplicate.ids.slice(1);

            const result = await ShareLink.deleteMany({
                _id: {
                    $in: idsToDelete
                }
            });

            deletedCount += result.deletedCount;

            console.log(
                `File ${duplicate._id}: kept 1 share link, deleted ${result.deletedCount} duplicate(s).`
            );
        }

        console.log('');
        console.log(
            `Cleanup complete. Deleted ${deletedCount} duplicate share link(s).`
        );

    } catch (error) {
        console.error(
            'Cleanup failed:',
            error.message
        );

        process.exitCode = 1;

    } finally {
        await mongoose.disconnect();
    }
}

cleanupDuplicateShareLinks();