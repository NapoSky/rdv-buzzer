// src/components/shared/modals/BuzzedModal.js
import React from 'react';
import BaseModal from '../BaseModal';

const BuzzedModal = ({ show, buzzedBy }) => {
  return (
    <BaseModal show={show} title="BzzZzZZz !">
      <p>{buzzedBy} prend la main !</p>
    </BaseModal>
  );
};

export default BuzzedModal;