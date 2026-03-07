import React, { useEffect, useState } from "react";
import { TouchableOpacity, Image, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useUserData } from "../../contexts/UserDataContext";
import UserLogo from "../../assets/default-icon.png";

const STORAGE_KEY = "USER_PROFILE_IMAGE";

const UserIcon = ({ onPress }) => {
  // const { userData } = useUserData();
  const [imageUri, setImageUri] = useState(null);

  // Load cached image
  useEffect(() => {
    const loadCachedImage = async () => {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        setImageUri(cached);
      }
    };
    loadCachedImage();
  }, []);

  // // Update when Firestore image changes
  // useEffect(() => {
  //   if (userData?.profilePicture) {
  //     setImageUri(userData.profilePicture);
  //     AsyncStorage.setItem(STORAGE_KEY, userData.profilePicture);
  //   }
  // }, [userData?.profilePicture]);

  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Image
        source={
          UserLogo // default icon
        }
        style={styles.avatar}
      />
    </TouchableOpacity>
  );
};

export default UserIcon;

const styles = StyleSheet.create({
  container: {
    marginLeft: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
});

// import React, { useEffect, useState } from 'react';
// import { TouchableOpacity, Image, StyleSheet } from 'react-native';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { useUserData } from '../../contexts/UserDataContext';
// import UserLogo from '../../assets/default-icon.png';

// const STORAGE_KEY = 'USER_PROFILE_IMAGE';

// const UserIcon = ({ onPress }) => {
//   const { userData } = useUserData();
//   const [imageUri, setImageUri] = useState(null);

//   // Load cached image
//   useEffect(() => {
//     const loadCachedImage = async () => {
//       const cached = await AsyncStorage.getItem(STORAGE_KEY);
//       if (cached) {
//         setImageUri(cached);
//       }
//     };
//     loadCachedImage();
//   }, []);

//   // Update when Firestore image changes
//   useEffect(() => {
//     if (userData?.profilePicture) {
//       setImageUri(userData.profilePicture);
//       AsyncStorage.setItem(STORAGE_KEY, userData.profilePicture);
//     }
//   }, [userData?.profilePicture]);

//   return (
//     <TouchableOpacity onPress={onPress} style={styles.container}>
//       <Image
//         source={
//           imageUri
//             ? { uri: imageUri } // user image
//             : UserLogo           // default icon
//         }
//         style={styles.avatar}
//       />
//     </TouchableOpacity>
//   );
// };

// export default UserIcon;

// const styles = StyleSheet.create({
//   container: {
//     marginLeft: 0,
//   },
//   avatar: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     borderWidth:2,
//     borderColor:"#26cc6b"
//   },
// });
